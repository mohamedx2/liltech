import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import type { BadgeSummary, CheckInResponse } from 'api-contracts';
import { hashQrToken } from './qr-token';

/**
 * Check-in logic: QR badge verification, single check-in, and revocation
 * (issuance and email delivery live in the badges module). Scan and revocation are audited transactionally.
 */

export async function listBadges(): Promise<BadgeSummary[]> {
  const prisma = getPrismaClient();

  // Prisma forbids `select` and `include` at the same query level — nested
  // relations must be expressed with `select` all the way down.
  const badges = await prisma.qrToken.findMany({
    orderBy: { issuedAt: 'desc' },
    include: {
      participant: {
        select: {
          name: true,
          color: true,
          team: { select: { name: true } },
          checkIn: { select: { checkedInAt: true } },
        },
      },
    },
  });

  return badges.map((badge) => ({
    participantId: badge.participantId,
    participantName: badge.participant.name,
    teamName: badge.participant.team.name,
    color: badge.participant.color,
    issuedAt: badge.issuedAt.toISOString(),
    ...(badge.revokedAt ? { revokedAt: badge.revokedAt.toISOString() } : {}),
    ...(badge.participant.checkIn
      ? { checkedInAt: badge.participant.checkIn.checkedInAt.toISOString() }
      : {}),
  }));
}

export async function scanCheckIn(token: string, adminUserId: string): Promise<CheckInResponse> {
  const prisma = getPrismaClient();
  const tokenHash = hashQrToken(token);

  try {
    return await prisma.$transaction(async (tx) => {
      const badge = await tx.qrToken.findUnique({
        where: { tokenHash },
        include: {
          participant: {
            include: {
              checkIn: true,
              team: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!badge) {
        throw ApiError.notFound('Unknown badge token.');
      }

      if (badge.revokedAt) {
        throw ApiError.forbidden('This badge has been revoked.');
      }

      if (badge.participant.checkIn) {
        throw ApiError.conflict('This participant is already checked in.');
      }

      const checkIn = await tx.checkInRecord.create({
        data: { participantId: badge.participantId, checkedByUserId: adminUserId },
      });

      // Only a team still at `registered` advances: a late member's check-in
      // must never move a team that already progressed back to `checked_in`.
      await tx.team.updateMany({
        where: { id: badge.participant.team.id, progressState: 'registered' },
        data: { progressState: 'checked_in' },
      });

      await tx.auditLog.create({
        data: {
          action: 'checkin.scan',
          actorId: adminUserId,
          targetType: 'check_in_record',
          targetId: checkIn.id,
        },
      });

      return {
        participant: {
          id: badge.participant.id,
          name: badge.participant.name,
          color: badge.participant.color,
        },
        team: {
          id: badge.participant.team.id,
          name: badge.participant.team.name,
        },
        checkedInAt: checkIn.checkedInAt.toISOString(),
      };
    });
  } catch (error) {
    // The unique constraint on check-in participant makes double check-in
    // impossible even when two scans race each other.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict('This participant is already checked in.');
    }
    throw error;
  }
}

export async function revokeBadge(
  participantId: string,
  adminUserId: string,
): Promise<{ revokedAt: string }> {
  const prisma = getPrismaClient();

  const revokedAt = prisma.$transaction(async (tx) => {
    const existing = await tx.qrToken.findUnique({ where: { participantId } });

    if (!existing) {
      throw ApiError.notFound('This participant has no badge.');
    }

    if (existing.revokedAt) {
      throw ApiError.conflict('This badge is already revoked.');
    }

    const revocationTime = new Date();

    const revoked = await tx.qrToken.update({
      where: { participantId },
      data: { revokedAt: revocationTime },
    });

    await tx.auditLog.create({
      data: {
        action: 'checkin.badge_revoked',
        actorId: adminUserId,
        targetType: 'qr_token',
        targetId: revoked.id,
      },
    });

    return revocationTime;
  });

  return { revokedAt: (await revokedAt).toISOString() };
}
