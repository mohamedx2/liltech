import { env } from '../../config/env';
import { getPrismaClient } from '../../config/database';
import { logger } from '../../utils/logger';
import { decryptQrToken, encryptQrToken, generateQrToken } from '../checkin/qr-token';
import { scheduleBadgeEmails, type BadgeDelivery } from './badges.service';

/**
 * Badge maintenance: repairs that make every participant's QR code readable
 * on the team portal and every badge email eventually go out. All of it is
 * idempotent, so it runs safely at every API start.
 */

function qrTokenKey(): Buffer {
  return Buffer.from(env.QR_TOKEN_KEY, 'base64');
}

const participantForDelivery = {
  id: true,
  name: true,
  email: true,
  color: true,
  team: { select: { name: true } },
} as const;

/**
 * Gives every participant a readable badge:
 * - a participant with no badge at all gets one;
 * - an active badge issued before encrypted storage existed (hash only, so
 *   its QR code cannot be shown again) is reissued. Its old code stops
 *   working; the new one shows on the team portal.
 * Badges are distributed by the admin dispatch (Admin → Emails), so a new
 * badge is not emailed here. A reissued badge whose old code had already been
 * emailed is marked `pending`, so the startup retry emails the new one: nobody
 * arrives at the entrance holding only a QR code that silently stopped
 * working. Revoked badges are left alone.
 * Returns how many badges were written.
 */
export async function backfillReadableBadges(): Promise<{ created: number; reissued: number }> {
  const prisma = getPrismaClient();
  const key = qrTokenKey();

  const withoutBadge = await prisma.participant.findMany({
    where: { badge: null },
    select: { id: true },
  });
  for (const participant of withoutBadge) {
    const { token, tokenHash } = generateQrToken();
    await prisma.qrToken.create({
      data: {
        participantId: participant.id,
        tokenHash,
        tokenCiphertext: encryptQrToken(token, key),
        // Not emailed yet: the admin dispatch distributes badges.
        emailStatus: null,
      },
    });
  }

  const unreadable = await prisma.qrToken.findMany({
    where: { tokenCiphertext: null, revokedAt: null },
    select: { id: true, emailStatus: true, participant: { select: { email: true } } },
  });
  for (const badge of unreadable) {
    const { token, tokenHash } = generateQrToken();
    // The `tokenCiphertext: null` guard keeps a concurrent run from
    // reissuing the same badge twice.
    await prisma.qrToken.updateMany({
      where: { id: badge.id, tokenCiphertext: null },
      data: {
        tokenHash,
        tokenCiphertext: encryptQrToken(token, key),
        issuedAt: new Date(),
        // Re-email only a code that was already distributed; an undistributed
        // badge waits for the admin dispatch like any other.
        emailStatus: badge.participant.email && badge.emailStatus !== null ? 'pending' : null,
        emailLastSentAt: null,
      },
    });
  }

  return { created: withoutBadge.length, reissued: unreadable.length };
}

async function deliveriesFor(where: object): Promise<BadgeDelivery[]> {
  const prisma = getPrismaClient();
  const key = qrTokenKey();

  const badges = await prisma.qrToken.findMany({
    where: {
      revokedAt: null,
      tokenCiphertext: { not: null },
      participant: { email: { not: null } },
      ...where,
    },
    select: { tokenCiphertext: true, participant: { select: participantForDelivery } },
  });

  return badges.flatMap((badge) => {
    const token = badge.tokenCiphertext ? decryptQrToken(badge.tokenCiphertext, key) : null;
    const { participant } = badge;
    return token && participant.email
      ? [
          {
            participantId: participant.id,
            participantName: participant.name,
            email: participant.email,
            teamName: participant.team.name,
            color: participant.color,
            token,
          },
        ]
      : [];
  });
}

/**
 * At startup nothing is being sent, so a badge still `pending` was cut off
 * by a restart: send it again.
 */
export async function retryInterruptedBadgeEmails(): Promise<number> {
  const deliveries = await deliveriesFor({ emailStatus: 'pending' });
  scheduleBadgeEmails(deliveries);
  return deliveries.length;
}

/** Startup repair; logs and never throws, so the API always starts. */
export async function runBadgeMaintenance(): Promise<void> {
  try {
    const backfill = await backfillReadableBadges();
    const retried = await retryInterruptedBadgeEmails();
    if (backfill.created + backfill.reissued + retried > 0) {
      logger.info({ ...backfill, retriedEmails: retried }, 'badge maintenance completed');
    }
  } catch (error) {
    logger.error(
      { reason: error instanceof Error ? error.message : String(error) },
      'badge maintenance failed',
    );
  }
}
