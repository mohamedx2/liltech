import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  TEAM_MEMBERS_TOTAL_MAX,
  type AddParticipantRequest,
  type AdminTeam,
  type BadgeColor,
  type RenameTeamRequest,
  type ResetTeamPasswordResponse,
  type SetTeamStatusRequest,
  type UpdateParticipantRequest,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { hashPassword } from '../auth/password.service';
import { issueBadgeInTx, scheduleBadgeEmails } from '../badges/badges.service';
import { getEventState } from '../event-state/event-state.service';
import { assignBalancedColors } from '../registration/registration.service';

/**
 * Admin team and participant operations — the fixes organizers apply on
 * event night. Every write is audited in the same transaction as the change
 * and returns the refreshed team, so the dashboard never shows stale state.
 *
 * Rules enforced here:
 * - teams can be deleted only before the event goes live (afterwards they are
 *   withdrawn or disqualified, which keeps their history);
 * - a team never exceeds the maximum size; the leader cannot be removed;
 * - a participant email stays unique across all teams, and a leader email
 *   change also changes the team login;
 * - a team that is not `active` cannot be checked in.
 */

const teamInclude = {
  leader: { select: { email: true } },
  participants: {
    orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
    include: {
      badge: true,
      checkIn: { select: { checkedInAt: true, checkedByUser: { select: { name: true } } } },
      paidBy: { select: { name: true } },
    },
  },
  ctfSolves: {
    orderBy: { solvedAt: 'asc' },
    include: { challenge: { select: { title: true } } },
  },
} satisfies Prisma.TeamInclude;

type TeamWithDetails = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

function toAdminTeam(team: TeamWithDetails): AdminTeam {
  const leader = team.participants.find((participant) => participant.isLeader);

  return {
    id: team.id,
    name: team.name,
    progressState: team.progressState,
    status: team.status,
    statusReason: team.statusReason,
    statusChangedAt: team.statusChangedAt?.toISOString() ?? null,
    createdAt: team.createdAt.toISOString(),
    leader: { id: team.leaderId, name: leader?.name ?? '', email: team.leader.email },
    participants: team.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isLeader: participant.isLeader,
      email: participant.email,
      university: participant.university,
      phone: participant.phone,
      color: participant.color,
      checkedInAt: participant.checkIn?.checkedInAt.toISOString() ?? null,
      checkedInByName: participant.checkIn?.checkedByUser.name ?? null,
      paidAt: participant.paidAt?.toISOString() ?? null,
      paidByName: participant.paidBy?.name ?? null,
      badge: participant.badge
        ? {
            issuedAt: participant.badge.issuedAt.toISOString(),
            revokedAt: participant.badge.revokedAt?.toISOString() ?? null,
            emailStatus: participant.badge.emailStatus,
            emailLastSentAt: participant.badge.emailLastSentAt?.toISOString() ?? null,
          }
        : null,
    })),
    ctfSolves: team.ctfSolves.map((solve) => ({
      challengeId: solve.challengeId,
      challengeTitle: solve.challenge.title,
      solvedAt: solve.solvedAt.toISOString(),
    })),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Tx = Prisma.TransactionClient;

async function loadTeam(tx: Tx | ReturnType<typeof getPrismaClient>, teamId: string) {
  const team = await tx.team.findUnique({ where: { id: teamId }, include: teamInclude });
  if (!team) {
    throw ApiError.notFound('Team not found.');
  }
  return team;
}

async function loadParticipant(tx: Tx, participantId: string) {
  const participant = await tx.participant.findUnique({
    where: { id: participantId },
    include: {
      checkIn: { select: { id: true } },
      team: { select: { id: true, name: true, status: true, leaderId: true } },
    },
  });
  if (!participant) {
    throw ApiError.notFound('Participant not found.');
  }
  return participant;
}

/**
 * A team whose last checked-in member was undone or removed goes back to
 * `registered` — but only from `checked_in`, never from a later state.
 */
async function revertCheckInProgressIfEmpty(tx: Tx, teamId: string): Promise<void> {
  const remaining = await tx.checkInRecord.count({ where: { participant: { teamId } } });
  if (remaining === 0) {
    await tx.team.updateMany({
      where: { id: teamId, progressState: 'checked_in' },
      data: { progressState: 'registered' },
    });
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listAdminTeams(): Promise<{ items: AdminTeam[]; total: number }> {
  const prisma = getPrismaClient();
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'desc' },
    include: teamInclude,
  });
  const items = teams.map(toAdminTeam);
  return { items, total: items.length };
}

export async function getAdminTeam(teamId: string): Promise<AdminTeam> {
  return toAdminTeam(await loadTeam(getPrismaClient(), teamId));
}

// ── Team ─────────────────────────────────────────────────────────────────────

export async function renameTeam(
  teamId: string,
  request: RenameTeamRequest,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  try {
    return await prisma.$transaction(async (tx) => {
      await loadTeam(tx, teamId);
      await tx.team.update({ where: { id: teamId }, data: { name: request.name } });
      await recordAuditLog(
        {
          action: AuditAction.TeamRenamed,
          actorId: adminUserId,
          targetType: 'team',
          targetId: teamId,
        },
        tx,
      );
      return toAdminTeam(await loadTeam(tx, teamId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('A team with this name is already registered.', [
        { path: 'name', message: 'This team name is already taken.' },
      ]);
    }
    throw error;
  }
}

export async function setTeamStatus(
  teamId: string,
  request: SetTeamStatusRequest,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const team = await loadTeam(tx, teamId);
    if (team.status === request.status) {
      throw ApiError.conflict(`This team is already ${request.status}.`);
    }

    await tx.team.update({
      where: { id: teamId },
      data: {
        status: request.status,
        statusReason: request.status === 'active' ? null : (request.reason ?? null),
        statusChangedAt: new Date(),
      },
    });
    await recordAuditLog(
      {
        action: AuditAction.TeamStatusChanged,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
      },
      tx,
    );
    return toAdminTeam(await loadTeam(tx, teamId));
  });
}

/** 16 characters of base64url (96 bits): strong, and easy to read out loud. */
function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Gives a locked-out team a new password. Every open session of the team
 * account is ended. The password is returned once and only its hash is kept.
 */
export async function resetTeamPassword(
  teamId: string,
  adminUserId: string,
): Promise<ResetTeamPasswordResponse> {
  const prisma = getPrismaClient();
  const temporaryPassword = generateTemporaryPassword();
  // Hashing is slow on purpose; keep it out of the transaction.
  const passwordHash = await hashPassword(temporaryPassword);

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { leaderId: true } });
    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    await tx.user.update({ where: { id: team.leaderId }, data: { passwordHash } });
    const revoked = await tx.session.updateMany({
      where: { userId: team.leaderId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuditLog(
      {
        action: AuditAction.TeamPasswordReset,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
      },
      tx,
    );

    return { teamId, temporaryPassword, revokedSessions: revoked.count };
  });
}

/**
 * Deletes a team, its members, badges and team account — for duplicate,
 * test or spam registrations. Only before the event goes live: afterwards a
 * team is withdrawn or disqualified so its history stays intact.
 */
export async function deleteTeam(teamId: string, adminUserId: string): Promise<void> {
  const { phase } = await getEventState();
  if (phase !== 'registration' && phase !== 'checkin') {
    throw ApiError.conflict(
      `Teams can only be deleted before the event goes live (current phase: ${phase}). Withdraw or disqualify it instead.`,
    );
  }

  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { leaderId: true } });
    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    await tx.team.delete({ where: { id: teamId } });
    await tx.user.delete({ where: { id: team.leaderId } });
    await recordAuditLog(
      {
        action: AuditAction.TeamDeleted,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
      },
      tx,
    );
  });
}

// ── Participants ─────────────────────────────────────────────────────────────

/** Late addition or replacement member: gets a balanced color and a badge by email. */
export async function addParticipant(
  teamId: string,
  request: AddParticipantRequest,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();
  const email = request.email.toLowerCase();

  const { team, badge, participant } = await prisma
    .$transaction(
      async (tx) => {
        const existing = await loadTeam(tx, teamId);
        if (existing.participants.length >= TEAM_MEMBERS_TOTAL_MAX) {
          throw ApiError.conflict(
            `A team cannot have more than ${TEAM_MEMBERS_TOTAL_MAX} members. Remove someone first.`,
          );
        }
        if (await tx.participant.findFirst({ where: { email }, select: { id: true } })) {
          throw ApiError.conflict(`${email} is already registered on a team.`, [
            { path: 'email', message: 'This person is already registered on a team.' },
          ]);
        }

        const colorCounts = await tx.participant.groupBy({
          by: ['color'],
          where: { color: { not: null } },
          _count: { _all: true },
        });
        const [color] = assignBalancedColors(
          Object.fromEntries(
            colorCounts
              .filter((row) => row.color !== null)
              .map((row) => [row.color as BadgeColor, row._count._all]),
          ),
          1,
        );

        const created = await tx.participant.create({
          data: {
            teamId,
            name: request.name,
            email,
            university: request.university,
            phone: request.phone,
            isLeader: false,
            color,
          },
        });
        const issued = await issueBadgeInTx(tx, created.id, created.name, { queueEmail: true });
        await recordAuditLog(
          {
            action: AuditAction.ParticipantAdded,
            actorId: adminUserId,
            targetType: 'participant',
            targetId: created.id,
          },
          tx,
        );

        return { team: await loadTeam(tx, teamId), badge: issued, participant: created };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw ApiError.conflict('This email is already registered.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw ApiError.conflict('The team changed at the same time. Refresh and retry.');
      }
      throw error;
    });

  scheduleBadgeEmails([
    {
      participantId: participant.id,
      participantName: participant.name,
      email,
      teamName: team.name,
      color: participant.color,
      token: badge.token,
    },
  ]);

  return toAdminTeam(team);
}

/** Fixes a typo in a name, email, university or mobile number. A leader email change also changes the team login. */
export async function updateParticipant(
  participantId: string,
  request: UpdateParticipantRequest,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();
  const email = request.email?.toLowerCase();

  try {
    return await prisma.$transaction(async (tx) => {
      const participant = await loadParticipant(tx, participantId);

      if (email && email !== participant.email) {
        const clash = await tx.participant.findFirst({
          where: { email, id: { not: participantId } },
          select: { id: true },
        });
        if (clash) {
          throw ApiError.conflict(`${email} is already registered on a team.`, [
            { path: 'email', message: 'This person is already registered on a team.' },
          ]);
        }
        if (participant.isLeader) {
          const account = await tx.user.findUnique({ where: { email }, select: { id: true } });
          if (account && account.id !== participant.team.leaderId) {
            throw ApiError.conflict('An account with this email already exists.', [
              { path: 'email', message: 'This email is already used by another account.' },
            ]);
          }
        }
      }

      await tx.participant.update({
        where: { id: participantId },
        data: {
          name: request.name,
          email,
          university: request.university,
          phone: request.phone,
        },
      });
      if (participant.isLeader && (request.name || email)) {
        await tx.user.update({
          where: { id: participant.team.leaderId },
          data: { name: request.name, email },
        });
      }

      await recordAuditLog(
        {
          action: AuditAction.ParticipantUpdated,
          actorId: adminUserId,
          targetType: 'participant',
          targetId: participantId,
        },
        tx,
      );
      return toAdminTeam(await loadTeam(tx, participant.teamId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('This email is already registered.');
    }
    throw error;
  }
}

/** Removes a member who will not attend. The leader (team account) cannot be removed. */
export async function removeParticipant(
  participantId: string,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const participant = await loadParticipant(tx, participantId);
    if (participant.isLeader) {
      throw ApiError.conflict(
        'The team leader cannot be removed: the team account belongs to them.',
      );
    }

    await tx.participant.delete({ where: { id: participantId } });
    await revertCheckInProgressIfEmpty(tx, participant.teamId);
    await recordAuditLog(
      {
        action: AuditAction.ParticipantRemoved,
        actorId: adminUserId,
        targetType: 'participant',
        targetId: participantId,
      },
      tx,
    );
    return toAdminTeam(await loadTeam(tx, participant.teamId));
  });
}

/**
 * Checks a participant in without scanning (lost phone, unreadable QR code),
 * after staff verified their identity. Works even if the badge is revoked.
 */
export async function manualCheckIn(
  participantId: string,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  try {
    return await prisma.$transaction(async (tx) => {
      const participant = await loadParticipant(tx, participantId);
      if (participant.team.status !== 'active') {
        throw ApiError.conflict(
          `This team is ${participant.team.status} and cannot be checked in.`,
        );
      }
      if (participant.checkIn) {
        throw ApiError.conflict('This participant is already checked in.');
      }

      await tx.checkInRecord.create({ data: { participantId, checkedByUserId: adminUserId } });
      await tx.team.updateMany({
        where: { id: participant.teamId, progressState: 'registered' },
        data: { progressState: 'checked_in' },
      });
      await recordAuditLog(
        {
          action: AuditAction.CheckInManual,
          actorId: adminUserId,
          targetType: 'participant',
          targetId: participantId,
        },
        tx,
      );
      return toAdminTeam(await loadTeam(tx, participant.teamId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('This participant is already checked in.');
    }
    throw error;
  }
}

/** Undoes a mistaken check-in (wrong badge scanned, person left before the start). */
export async function undoCheckIn(participantId: string, adminUserId: string): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const participant = await loadParticipant(tx, participantId);
    if (!participant.checkIn) {
      throw ApiError.conflict('This participant is not checked in.');
    }

    await tx.checkInRecord.delete({ where: { participantId } });
    await revertCheckInProgressIfEmpty(tx, participant.teamId);
    await recordAuditLog(
      {
        action: AuditAction.CheckInUndone,
        actorId: adminUserId,
        targetType: 'participant',
        targetId: participantId,
      },
      tx,
    );
    return toAdminTeam(await loadTeam(tx, participant.teamId));
  });
}

// ── Participation fee ────────────────────────────────────────────────────────

/**
 * Marks one participant's participation fee as paid or unpaid. Idempotent:
 * setting the current state again writes nothing and records no audit entry.
 * Works for every team standing, so a withdrawn team's payment stays traceable.
 */
export async function setParticipantPayment(
  participantId: string,
  paid: boolean,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const participant = await loadParticipant(tx, participantId);
    const isPaid = participant.paidAt !== null;

    if (paid !== isPaid) {
      await tx.participant.update({
        where: { id: participantId },
        data: paid
          ? { paidAt: new Date(), paidById: adminUserId }
          : { paidAt: null, paidById: null },
      });
      await recordAuditLog(
        {
          action: paid
            ? AuditAction.ParticipantPaymentMarked
            : AuditAction.ParticipantPaymentCleared,
          actorId: adminUserId,
          targetType: 'participant',
          targetId: participantId,
        },
        tx,
      );
    }

    return toAdminTeam(await loadTeam(tx, participant.teamId));
  });
}

// ── Mini-CTF override ────────────────────────────────────────────────────────

/**
 * Gives a team early access to a challenge as if it had solved its Mini-CTF
 * (a flag that was valid but rejected, a platform outage during the CTF).
 */
export async function grantCtfSolve(
  teamId: string,
  challengeId: string,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    await loadTeam(tx, teamId);
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true },
    });
    if (!challenge) {
      throw ApiError.notFound('Challenge not found.');
    }

    const existing = await tx.challengeCtfSolve.findUnique({
      where: { challengeId_teamId: { challengeId, teamId } },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict('This team already has early access to this challenge.');
    }

    await tx.challengeCtfSolve.create({ data: { challengeId, teamId } });
    await recordAuditLog(
      {
        action: AuditAction.CtfSolveGranted,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
      },
      tx,
    );
    return toAdminTeam(await loadTeam(tx, teamId));
  });
}

export async function revokeCtfSolve(
  teamId: string,
  challengeId: string,
  adminUserId: string,
): Promise<AdminTeam> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    await loadTeam(tx, teamId);
    const removed = await tx.challengeCtfSolve.deleteMany({ where: { teamId, challengeId } });
    if (removed.count === 0) {
      throw ApiError.notFound('This team has no Mini-CTF solve for this challenge.');
    }

    await recordAuditLog(
      {
        action: AuditAction.CtfSolveRevoked,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
      },
      tx,
    );
    return toAdminTeam(await loadTeam(tx, teamId));
  });
}
