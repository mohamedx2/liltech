import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import type { BadgeSummary, CheckInResponse, IssueBadgeResponse } from 'api-contracts';
import { generateQrToken, hashQrToken } from './qr-token';

/**
 * Check-in logic: QR badge issuance, verification, single check-in, and
 * revocation. Scan and revocation are audited transactionally.
 */

export async function issueBadgeForParticipant(participantId: string): Promise<IssueBadgeResponse> {
  const prisma = getPrismaClient();

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { badge: true },
  });

  if (!participant) {
    throw ApiError.notFound('Participant not found.');
  }

  if (participant.badge && !participant.badge.revokedAt) {
    throw ApiError.conflict('This participant already has an active badge.');
  }

  const { token, tokenHash } = generateQrToken();

  await prisma.qrToken.upsert({
    where: { participantId },
    update: { tokenHash, issuedAt: new Date(), revokedAt: null },
    create: { participantId, tokenHash },
  });

  return {
    participantId: participant.id,
    participantName: participant.name,
    token,
    issuedAt: new Date().toISOString(),
  };
}

/** Issue a QR badge within an already-open transaction (atomic with registration). */
export async function issueBadgeForParticipantInTx(
  tx: Prisma.TransactionClient,
  participantId: string,
  participantName: string,
): Promise<IssueBadgeResponse> {
  const { token, tokenHash } = generateQrToken();

  const created = await tx.qrToken.create({
    data: { participantId, tokenHash },
    select: { issuedAt: true },
  });

  return {
    participantId,
    participantName,
    token,
    issuedAt: created.issuedAt.toISOString(),
  };
}

export async function listBadges(): Promise<BadgeSummary[]> {
  const prisma = getPrismaClient();

  const badges = await prisma.qrToken.findMany({
    orderBy: { issuedAt: 'desc' },
    include: {
      participant: {
        select: { name: true, checkIn: true },
        include: { team: { select: { name: true } } },
      },
    },
  });

  return badges.map((badge) => ({
    participantId: badge.participantId,
    participantName: badge.participant.name,
    teamName: badge.participant.team.name,
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

      await tx.team.update({
        where: { id: badge.participant.team.id },
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
