import type { Prisma } from '@prisma/client';
import {
  BADGE_EMAIL_RESEND_INTERVAL_MS,
  type BadgeColor,
  type BulkResendBadgeEmailsResponse,
  type IssueBadgeResponse,
  type ReissueBadgeResponse,
  type ResendBadgeEmailResponse,
  type SendBadgeEmailsResponse,
  type TeamBadgesResponse,
} from 'api-contracts';
import { env } from '../../config/env';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { decryptQrToken, encryptQrToken, generateQrToken } from '../checkin/qr-token';
import { renderQrDataUrl, sendBadgeEmail, sendBadgeEmailWithTemplate } from './badge-mailer';

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

/**
 * Issue a QR badge within an already-open transaction (atomic with registration).
 * `queueEmail` marks it `pending` for a delivery the caller schedules right
 * away; otherwise it stays unsent (`null`) until the admin dispatch, and the
 * startup retry of `pending` badges never picks it up.
 */
export async function issueBadgeInTx(
  tx: Prisma.TransactionClient,
  participantId: string,
  participantName: string,
  { queueEmail }: { queueEmail: boolean },
): Promise<IssueBadgeResponse> {
  const { token, tokenHash } = generateQrToken();

  const created = await tx.qrToken.create({
    data: {
      participantId,
      tokenHash,
      tokenCiphertext: encryptQrToken(token, qrTokenKey()),
      emailStatus: queueEmail ? 'pending' : null,
    },
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
async function deliverOne(
  delivery: BadgeDelivery,
  template?: BadgeEmailTemplate,
): Promise<'sent' | 'failed'> {
  const prisma = getPrismaClient();
  let status: 'sent' | 'failed' = 'failed';

  try {
    const email = {
      to: delivery.email,
      participantName: delivery.participantName,
      teamName: delivery.teamName,
      color: delivery.color,
      token: delivery.token,
    };
    const sent = template
      ? await sendBadgeEmailWithTemplate(email, template)
      : await sendBadgeEmail(email);
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
        reason: error instanceof Error ? error.message : String(error),
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

const inFlightDeliveries = new Set<Promise<unknown>>();

/**
 * Queues the badge emails of a new registration and returns immediately:
 * the HTTP response never waits for SMTP. Each badge starts as `pending`
 * and ends `sent` or `failed`; the team can read its badges meanwhile.
 */
export function scheduleBadgeEmails(deliveries: BadgeDelivery[]): void {
  const batch = Promise.allSettled(deliveries.map((delivery) => deliverOne(delivery)));
  inFlightDeliveries.add(batch);
  void batch.finally(() => inFlightDeliveries.delete(batch));
}

/** Resolves once every queued badge email has been attempted (tests, shutdown). */
export async function waitForScheduledBadgeEmails(): Promise<void> {
  while (inFlightDeliveries.size > 0) {
    await Promise.allSettled([...inFlightDeliveries]);
  }
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
        qrImageDataUrl: token ? await renderQrDataUrl(token, participant.color) : null,
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

/**
 * Issues a brand-new QR badge for a participant (lost badge, leaked QR code,
 * or a revoked badge that must work again). The previous token stops working
 * immediately; the new badge is emailed in the background when the
 * participant has an email address. Admin only, audited.
 */
export async function reissueBadge(
  participantId: string,
  adminUserId: string,
): Promise<ReissueBadgeResponse> {
  const prisma = getPrismaClient();
  const { token, tokenHash } = generateQrToken();
  const issuedAt = new Date();

  const participant = await prisma.$transaction(async (tx) => {
    const found = await tx.participant.findUnique({
      where: { id: participantId },
      select: { id: true, name: true, email: true, color: true, team: { select: { name: true } } },
    });
    if (!found) {
      throw ApiError.notFound('Participant not found.');
    }

    const badgeData = {
      tokenHash,
      tokenCiphertext: encryptQrToken(token, qrTokenKey()),
      issuedAt,
      revokedAt: null,
      emailStatus: found.email ? ('pending' as const) : null,
      emailLastSentAt: found.email ? issuedAt : null,
    };
    await tx.qrToken.upsert({
      where: { participantId },
      update: badgeData,
      create: { participantId, ...badgeData },
    });

    await recordAuditLog(
      {
        action: AuditAction.BadgeReissued,
        actorId: adminUserId,
        targetType: 'participant',
        targetId: participantId,
      },
      tx,
    );
    return found;
  });

  if (participant.email) {
    scheduleBadgeEmails([
      {
        participantId,
        participantName: participant.name,
        email: participant.email,
        teamName: participant.team.name,
        color: participant.color,
        token,
      },
    ]);
  }

  return {
    participantId,
    issuedAt: issuedAt.toISOString(),
    emailQueued: Boolean(participant.email),
  };
}

/** A `pending` email older than this is considered lost (e.g. a restart mid-send). */
const STALE_PENDING_EMAIL_MS = 10 * 60 * 1000;

/**
 * Retries every badge email that failed (or has been pending for too long),
 * e.g. after SMTP was misconfigured during registration. Revoked badges and
 * participants without an email are skipped. Emails go out in the
 * background; the call returns how many were queued. Admin only, audited.
 */
export async function resendFailedBadgeEmails(
  adminUserId: string,
): Promise<BulkResendBadgeEmailsResponse> {
  const prisma = getPrismaClient();
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - STALE_PENDING_EMAIL_MS);

  const badges = await prisma.qrToken.findMany({
    where: {
      revokedAt: null,
      participant: { email: { not: null } },
      OR: [
        { emailStatus: 'failed' },
        { emailStatus: 'pending', emailLastSentAt: { lt: stalePendingBefore } },
        { emailStatus: 'pending', emailLastSentAt: null },
        { emailStatus: null },
      ],
    },
    include: {
      participant: {
        select: { name: true, email: true, color: true, team: { select: { name: true } } },
      },
    },
  });

  const deliveries: BadgeDelivery[] = [];
  for (const badge of badges) {
    const email = badge.participant.email;
    if (!email) {
      continue;
    }

    let token = badge.tokenCiphertext ? decryptQrToken(badge.tokenCiphertext, qrTokenKey()) : null;
    if (!token) {
      // Issued before retrievable storage: the badge has to be reissued.
      const issued = generateQrToken();
      await prisma.qrToken.update({
        where: { id: badge.id },
        data: {
          tokenHash: issued.tokenHash,
          tokenCiphertext: encryptQrToken(issued.token, qrTokenKey()),
          issuedAt: now,
        },
      });
      token = issued.token;
    }

    deliveries.push({
      participantId: badge.participantId,
      participantName: badge.participant.name,
      email,
      teamName: badge.participant.team.name,
      color: badge.participant.color,
      token,
    });
  }

  if (deliveries.length > 0) {
    await prisma.qrToken.updateMany({
      where: { participantId: { in: deliveries.map((delivery) => delivery.participantId) } },
      data: { emailStatus: 'pending', emailLastSentAt: now },
    });
  }

  await recordAuditLog({
    action: AuditAction.BadgeEmailBulkResent,
    actorId: adminUserId,
    targetType: 'badge_batch',
    targetId: String(deliveries.length),
  });

  scheduleBadgeEmails(deliveries);
  return { queued: deliveries.length };
}

/** Admin-written subject and body; omitted fields keep the default copy. */
export interface BadgeEmailTemplate {
  subject?: string;
  body?: string;
}

let bulkDispatchRunning = false;

/**
 * Emails every active badge (participants with an email), optionally with an
 * admin-written subject and body. Admin only, audited.
 *
 * Returns as soon as the badges are queued: emails go out one at a time in the
 * background (Gmail refuses many parallel SMTP connections), and each badge
 * moves from `pending` to `sent` or `failed`. Only one dispatch runs at a
 * time. A restart during a dispatch re-sends the `pending` badges with the
 * default copy.
 */
export async function sendBulkBadgeEmailsWithTemplate(
  adminUserId: string,
  template: BadgeEmailTemplate = {},
): Promise<SendBadgeEmailsResponse> {
  if (bulkDispatchRunning) {
    throw ApiError.conflict('A badge email dispatch is already running. Wait for it to finish.');
  }
  bulkDispatchRunning = true;

  try {
    const prisma = getPrismaClient();
    const now = new Date();
    const badges = await prisma.qrToken.findMany({
      where: { revokedAt: null, participant: { email: { not: null } } },
      include: {
        participant: {
          select: { name: true, email: true, color: true, team: { select: { name: true } } },
        },
      },
    });

    const deliveries: BadgeDelivery[] = [];
    for (const badge of badges) {
      const email = badge.participant.email;
      if (!email) {
        continue;
      }

      let token = badge.tokenCiphertext
        ? decryptQrToken(badge.tokenCiphertext, qrTokenKey())
        : null;
      if (!token) {
        // A badge issued before encrypted storage cannot be shown again: reissue
        // it, like the failed-email resend does. Its old code stops working.
        const issued = generateQrToken();
        await prisma.qrToken.update({
          where: { id: badge.id },
          data: {
            tokenHash: issued.tokenHash,
            tokenCiphertext: encryptQrToken(issued.token, qrTokenKey()),
            issuedAt: now,
          },
        });
        token = issued.token;
      }

      deliveries.push({
        participantId: badge.participantId,
        participantName: badge.participant.name,
        email,
        teamName: badge.participant.team.name,
        color: badge.participant.color,
        token,
      });
    }

    if (deliveries.length > 0) {
      await prisma.qrToken.updateMany({
        where: { participantId: { in: deliveries.map((delivery) => delivery.participantId) } },
        data: { emailStatus: 'pending', emailLastSentAt: now },
      });
    }

    await recordAuditLog({
      action: AuditAction.BadgeEmailBulkResent,
      actorId: adminUserId,
      targetType: 'badge_batch',
      targetId: String(deliveries.length),
      summary: `Manual dispatch of ${deliveries.length} badge email(s)${
        template.subject ? ` with custom subject "${template.subject.slice(0, 50)}"` : ''
      }${template.body ? ' and custom body' : ''}`,
    });

    const batch = (async () => {
      for (const delivery of deliveries) {
        await deliverOne(delivery, template);
      }
    })().finally(() => {
      bulkDispatchRunning = false;
    });
    inFlightDeliveries.add(batch);
    void batch.finally(() => inFlightDeliveries.delete(batch));

    return { queued: deliveries.length };
  } catch (error) {
    bulkDispatchRunning = false;
    throw error;
  }
}
