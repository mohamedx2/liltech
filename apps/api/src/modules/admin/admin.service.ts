import { randomBytes } from 'node:crypto';
import { getPrismaClient } from '../../config/database';
import type {
  AdminTeamListResponse,
  ResetTeamPasswordRequest,
  ResetTeamPasswordResponse,
  TeamResponse,
} from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { hashPassword } from '../auth/password.service';

/**
 * Admin operational listings (read-only). Backed by existing models only —
 * challenge track and results administration stay unimplemented until the
 * decisions in `docs/decisions/OPEN_QUESTIONS.md` (questions 1, 3–5) land.
 */

/** Full team roster, newest first, leaders ordered first within each team. */
export async function listTeams(): Promise<AdminTeamListResponse> {
  const prisma = getPrismaClient();

  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      participants: {
        orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
        include: {
          checkIn: { select: { checkedInAt: true } },
          badge: { select: { emailStatus: true } },
        },
      },
    },
  });

  const items: TeamResponse[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    progressState: team.progressState,
    createdAt: team.createdAt.toISOString(),
    leader: {
      id: team.leaderId,
      name: team.participants.find((participant) => participant.isLeader)?.name ?? '',
    },
    participants: team.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isLeader: participant.isLeader,
      ...(participant.checkIn
        ? { checkedInAt: participant.checkIn.checkedInAt.toISOString() }
        : {}),
      email: participant.email,
      badgeEmailStatus: participant.badge?.emailStatus ?? null,
    })),
  }));

  return { items, total: items.length };
}

/** 16 characters of base64url (96 bits): strong, and easy to read out loud. */
function generateTeamPassword(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Sets a new password on a team account (the shared login) and ends all of
 * its sessions. The old password is never readable: only its hash is stored.
 */
export async function resetTeamPassword(
  teamId: string,
  request: ResetTeamPasswordRequest,
  adminUserId: string,
): Promise<ResetTeamPasswordResponse> {
  const prisma = getPrismaClient();
  const password = request.password ?? generateTeamPassword();
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, leader: { select: { id: true, email: true, role: true } } },
    });

    if (!team || team.leader.role !== 'team') {
      throw ApiError.notFound('Team not found.');
    }

    await tx.user.update({ where: { id: team.leader.id }, data: { passwordHash } });
    await tx.session.updateMany({
      where: { userId: team.leader.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuditLog(
      {
        action: AuditAction.TeamPasswordReset,
        actorId: adminUserId,
        targetType: 'team',
        targetId: team.id,
      },
      tx,
    );

    return { teamId: team.id, teamName: team.name, email: team.leader.email, password };
  });
}
