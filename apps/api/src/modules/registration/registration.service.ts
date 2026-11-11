import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import type { CreateTeamRequest, TeamResponse } from 'api-contracts';
import { issueBadgeForParticipantInTx } from '../checkin/checkin.service';
import { hashPassword } from '../auth/password.service';

/**
 * Team registration: the team leader supplies their account credentials and
 * 2–4 additional member names. Team, account, and participants are created in
 * one transaction — a partially registered team must never be observable.
 *
 * Deliberately NOT provided here (pending decisions): challenge track
 * assignment, QR badge email delivery, registration phase gating.
 */

export interface TeamRegistrationResult extends TeamResponse {
  /**
   * QR badges issued for each participant, presented once. Delivery by email
   * is pending (open question 8); until then issuance results are returned to
   * the creator so staff can distribute them manually.
   */
  badges: Array<{
    participantId: string;
    participantName: string;
    token: string;
  }>;
}

const LEADER_ACCOUNT_ROLE = 'team' as const;

export async function registerTeamWithBadges(
  request: CreateTeamRequest,
): Promise<TeamRegistrationResult> {
  const prisma = getPrismaClient();
  const leaderEmail = request.leader.email.toLowerCase();

  const totalSize = 1 + request.members.length;
  if (totalSize < 3 || totalSize > 5) {
    throw ApiError.badRequest('A team must have 3 to 5 members total, including the leader.');
  }

  const { team: created, badges } = await prisma
    .$transaction(async (tx) => {
      const emailTaken = await tx.user.findUnique({
        where: { email: leaderEmail },
        select: { id: true },
      });

      if (emailTaken) {
        throw ApiError.conflict('An account with this email already exists.');
      }

      if (await tx.team.findUnique({ where: { name: request.teamName }, select: { id: true } })) {
        throw ApiError.conflict('A team with this name is already registered.');
      }

      const passwordHash = await hashPassword(request.leader.password);

      const leader = await tx.user.create({
        data: {
          role: LEADER_ACCOUNT_ROLE,
          email: leaderEmail,
          name: request.leader.name,
          passwordHash,
        },
      });

      const created = await tx.team.create({
        data: {
          name: request.teamName,
          leaderId: leader.id,
          participants: {
            create: [
              { name: request.leader.name, isLeader: true, email: leaderEmail },
              ...request.members.map((member) => ({
                name: member.name,
                isLeader: false,
                email: member.email?.toLowerCase(),
              })),
            ],
          },
        },
        include: {
          participants: { orderBy: [{ isLeader: 'desc' }, { name: 'asc' }] },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'registration.team_created',
          actorId: leader.id,
          targetType: 'team',
          targetId: created.id,
        },
      });

      const issuedBadges = await Promise.all(
        created.participants.map((participant) =>
          issueBadgeForParticipantInTx(tx, participant.id, participant.name),
        ),
      );

      return { team: created, badges: issuedBadges };
    })
    .catch((error: unknown) => {
      // The unique constraints are the final defense against two concurrent
      // registrations of the same email or team name.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiError.conflict('A team with this name or email is already registered.');
      }
      throw error;
    });

  const registered: TeamResponse = {
    id: created.id,
    name: created.name,
    progressState: created.progressState,
    createdAt: created.createdAt.toISOString(),
    leader: { id: created.leaderId, name: request.leader.name },
    participants: created.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isLeader: participant.isLeader,
    })),
  };

  return { ...registered, badges };
}

/** The authenticated team leader's own team, with participants and progress. */
export async function getMyTeam(leaderUserId: string): Promise<TeamResponse | null> {
  const prisma = getPrismaClient();

  const team = await prisma.team.findUnique({
    where: { leaderId: leaderUserId },
    include: {
      participants: {
        orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
        include: { checkIn: { select: { checkedInAt: true } } },
      },
    },
  });

  if (!team) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    progressState: team.progressState,
    createdAt: team.createdAt.toISOString(),
    leader: {
      id: team.leaderId,
      name: team.participants.find((p) => p.isLeader)?.name ?? '',
    },
    participants: team.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isLeader: participant.isLeader,
      ...(participant.checkIn
        ? { checkedInAt: participant.checkIn.checkedInAt.toISOString() }
        : {}),
    })),
  };
}
