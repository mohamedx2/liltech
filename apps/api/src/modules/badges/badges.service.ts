import type { Prisma } from '@prisma/client';
import {
  BADGE_EMAIL_RESEND_INTERVAL_MS,
  type BadgeColor,
  type IssueBadgeResponse,
  type ResendBadgeEmailResponse,
  type TeamBadgesResponse,
} from 'api-contracts';
import { env } from '../../config/env';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { decryptQrToken, encryptQrToken, generateQrToken } from '../checkin/qr-token';
import { renderQrDataUrl, sendBadgeEmail } from './badge-mailer';

/**
 * QR badge lifecycle beyond check-in: issuance with a retrievable encrypted
 * copy, email delivery with a per-participant resend limit, and the team's
 * own badge listing.
 *
 * Scoping rule: team callers are resolved through `Team.leaderId = user.id`
 * inside every query, so a participant id from another team is
 * indistinguishable from an unknown one (404).
 */

function qrTokenKey(): Buffer {
  return Buffer.from(env.QR_TOKEN_KEY, 'base64');
}

/** Issue a QR badge within an already-open transaction (atomic with registration). */
export async function issueBadgeInTx(
  tx: Prisma.TransactionClient,
  participantId: string,
  participantName: string,
): Promise<IssueBadgeResponse> {
  const { token, tokenHash } = generateQrToken();

  const created = await tx.qrToken.create({
    data: { participantId, tokenHash, tokenCiphertext: encryptQrToken(token, qrTokenKey()) },
    select: { issuedAt: true },
  });

  return {
    participantId,
    participantName,
    token,
    issuedAt: created.issuedAt.toISOString(),
  };
}

export interface BadgeDelivery {
  participantId: string;
  participantName: string;
  email: string;
  teamName: string;
  color: BadgeColor | null;
  token: string;
}

/**
 * Sends one badge email and records the attempt. Never throws: a delivery
 * failure must not undo a registration, and the team can still read its
 * badges on the platform.
 */
async function deliverOne(delivery: BadgeDelivery): Promise<'sent' | 'failed'> {
  const prisma = getPrismaClient();
  let status: 'sent' | 'failed' = 'failed';

  try {
    const sent = await sendBadgeEmail({
      to: delivery.email,
      participantName: delivery.participantName,
      teamName: delivery.teamName,
      color: delivery.color,
      token: delivery.token,
    });
    status = sent ? 'sent' : 'failed';

    if (!sent) {
      logger.warn(
        { participantId: delivery.participantId },
        'badge email not sent: SMTP is not configured',
      );
    }
  } catch (error) {
    // The error is logged without the message body (it embeds the badge).
    logger.error(
      {
        participantId: delivery.participantId,
        err: error instanceof Error ? error.message : error,
      },
      'badge email delivery failed',
    );
  }

  await prisma.qrToken.update({
    where: { participantId: delivery.participantId },
    data: { emailStatus: status, emailLastSentAt: new Date() },
  });

  return status;
}

/** Delivers the badges issued at registration, in parallel. */
export async function deliverBadgeEmails(deliveries: BadgeDelivery[]): Promise<void> {
  await Promise.allSettled(deliveries.map((delivery) => deliverOne(delivery)));
}

function resendAvailableAt(lastSentAt: Date | null): Date | null {
  if (!lastSentAt) {
    return null;
  }
  const availableAt = new Date(lastSentAt.getTime() + BADGE_EMAIL_RESEND_INTERVAL_MS);
  return availableAt.getTime() > Date.now() ? availableAt : null;
}

/** Every badge of the caller's own team, readable again for display at check-in. */
export async function listTeamBadges(leaderUserId: string): Promise<TeamBadgesResponse | null> {
  const prisma = getPrismaClient();

  const team = await prisma.team.findUnique({
    where: { leaderId: leaderUserId },
    include: {
      participants: {
        orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
        include: { badge: true, checkIn: { select: { id: true } } },
      },
    },
  });

  if (!team) {
    return null;
  }

  const badges = await Promise.all(
    team.participants.map(async (participant) => {
      const badge = participant.badge;
      const isRevoked = Boolean(badge?.revokedAt);
      const token =
        badge && !isRevoked && badge.tokenCiphertext
          ? decryptQrToken(badge.tokenCiphertext, qrTokenKey())
          : null;
      const availableAt = resendAvailableAt(badge?.emailLastSentAt ?? null);

      return {
        participantId: participant.id,
        participantName: participant.name,
        roleInTeam: participant.isLeader ? ('leader' as const) : ('member' as const),
        color: participant.color,
        qrToken: token,
        qrImageDataUrl: token ? await renderQrDataUrl(token) : null,
        isRevoked,
        isCheckedIn: Boolean(participant.checkIn),
        email: participant.email,
        emailStatus: badge?.emailStatus ?? null,
        emailLastSentAt: badge?.emailLastSentAt?.toISOString() ?? null,
        emailResendAvailableAt: availableAt?.toISOString() ?? null,
      };
    }),
  );

  return { teamId: team.id, teamName: team.name, badges };
}

export type ResendActor =
  { kind: 'team'; leaderUserId: string } | { kind: 'admin'; adminUserId: string };

/**
 * Resends one participant's badge email.
 *
 * - Team callers may only target their own team's participants (404 otherwise)
 *   and are limited to one email per participant per hour (429 with the time
 *   the next resend is accepted). The limit is claimed atomically from the
 *   stored timestamp, so parallel clicks or a restart cannot bypass it.
 * - Administrators bypass the hourly limit; their resends are audited.
 * - A badge without a readable stored token (issued before retrievable
 *   storage) is reissued: the old QR code stops working.
 */
export async function resendBadgeEmail(
  participantId: string,
  actor: ResendActor,
): Promise<ResendBadgeEmailResponse> {
  const prisma = getPrismaClient();

  const participant = await prisma.participant.findFirst({
    where: {
      id: participantId,
      ...(actor.kind === 'team' ? { team: { leaderId: actor.leaderUserId } } : {}),
    },
    include: { badge: true, team: { select: { name: true } } },
  });

  if (!participant || !participant.badge) {
    throw ApiError.notFound('Participant not found.');
  }

  if (!participant.email) {
    throw ApiError.conflict('This participant has no email address on file.');
  }

  if (participant.badge.revokedAt) {
    throw ApiError.conflict('This badge has been revoked. Please contact the organizers.');
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - BADGE_EMAIL_RESEND_INTERVAL_MS);

  const claimed = await prisma.qrToken.updateMany({
    where: {
      participantId,
      revokedAt: null,
      ...(actor.kind === 'team'
        ? { OR: [{ emailLastSentAt: null }, { emailLastSentAt: { lte: cutoff } }] }
        : {}),
    },
    data: { emailLastSentAt: now, emailStatus: 'pending' },
  });

  if (claimed.count === 0) {
    const current = await prisma.qrToken.findUnique({
      where: { participantId },
      select: { emailLastSentAt: true },
    });
    const availableAt =
      resendAvailableAt(current?.emailLastSentAt ?? null) ??
      new Date(now.getTime() + BADGE_EMAIL_RESEND_INTERVAL_MS);
    throw ApiError.rateLimited(
      `This badge email was sent less than an hour ago. You can resend it at ${availableAt.toISOString()}.`,
      { emailResendAvailableAt: availableAt.toISOString() },
    );
  }

  let token = participant.badge.tokenCiphertext
    ? decryptQrToken(participant.badge.tokenCiphertext, qrTokenKey())
    : null;

  if (!token) {
    const issued = generateQrToken();
    await prisma.qrToken.update({
      where: { participantId },
      data: {
        tokenHash: issued.tokenHash,
        tokenCiphertext: encryptQrToken(issued.token, qrTokenKey()),
        issuedAt: now,
      },
    });
    token = issued.token;
  }

  if (actor.kind === 'admin') {
    await recordAuditLog({
      action: AuditAction.BadgeEmailResent,
      actorId: actor.adminUserId,
      targetType: 'participant',
      targetId: participantId,
    });
  }

  const status = await deliverOne({
    participantId,
    participantName: participant.name,
    email: participant.email,
    teamName: participant.team.name,
    color: participant.color,
    token,
  });

  const stored = await prisma.qrToken.findUniqueOrThrow({
    where: { participantId },
    select: { emailLastSentAt: true },
  });
  const lastSentAt = stored.emailLastSentAt ?? now;

  return {
    participantId,
    emailStatus: status,
    emailLastSentAt: lastSentAt.toISOString(),
    emailResendAvailableAt: new Date(
      lastSentAt.getTime() + BADGE_EMAIL_RESEND_INTERVAL_MS,
    ).toISOString(),
  };
}
