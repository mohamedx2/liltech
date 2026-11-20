import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import {
  BADGE_COLORS,
  TEAM_MEMBERS_TOTAL_MAX,
  TEAM_MEMBERS_TOTAL_MIN,
  type BadgeColor,
  type CreateTeamRequest,
  type TeamRegistrationResponse,
  type TeamResponse,
} from 'api-contracts';
import { issueBadgeInTx } from '../badges/badges.service';
import { hashPassword } from '../auth/password.service';
import { getEventState } from '../event-state/event-state.service';

/**
 * Team registration: the team leader supplies the team account credentials
 * and 3–6 additional members. Team, account, participants, badge colors and
 * QR badges are created in one serializable transaction — a partially
 * registered team must never be observable, and two concurrent registrations
 * cannot both take the same "least used" color. Badge emails are sent once
 * the transaction has committed, in the background (the response does not
 * wait for SMTP); a delivery failure never undoes a registration.
 */

export type TeamRegistrationResult = TeamRegistrationResponse;

const LEADER_ACCOUNT_ROLE = 'team' as const;

/** Serialization failures are retried; anything else surfaces. */
const MAX_TRANSACTION_ATTEMPTS = 4;

/**
 * Picks a color for each new participant, always taking the color with the
 * fewest participants so far (ties broken in `BADGE_COLORS` order), so the
 * four groups never differ by more than one.
 */
export function assignBalancedColors(
  currentCounts: Partial<Record<BadgeColor, number>>,
  participantCount: number,
): BadgeColor[] {
  const counts = new Map(BADGE_COLORS.map((color) => [color, currentCounts[color] ?? 0]));
  const assigned: BadgeColor[] = [];

  for (let index = 0; index < participantCount; index++) {
    let chosen = BADGE_COLORS[0];
    for (const color of BADGE_COLORS) {
      if ((counts.get(color) ?? 0) < (counts.get(chosen) ?? 0)) {
        chosen = color;
      }
    }
    counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
    assigned.push(chosen);
  }

  return assigned;
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export async function registerTeamWithBadges(
  request: CreateTeamRequest,
): Promise<TeamRegistrationResult> {
  const totalSize = 1 + request.members.length;
  if (totalSize < TEAM_MEMBERS_TOTAL_MIN || totalSize > TEAM_MEMBERS_TOTAL_MAX) {
    throw ApiError.badRequest(
      `A team must have ${TEAM_MEMBERS_TOTAL_MIN} to ${TEAM_MEMBERS_TOTAL_MAX} members total, including the leader.`,
    );
  }

  // Registration stays open through check-in and closes when the event goes live.
  const { phase } = await getEventState();
  if (phase !== 'registration' && phase !== 'checkin') {
    throw ApiError.conflict('Registration is closed.');
  }

  const leaderEmail = request.leader.email.toLowerCase();
  const roster = [
    {
      name: request.leader.name,
      isLeader: true,
      email: leaderEmail,
      university: request.leader.university,
      phone: request.leader.phone,
      path: 'leader.email',
    },
    ...request.members.map((member, index) => ({
      name: member.name,
      isLeader: false,
      email: member.email.toLowerCase(),
      university: member.university,
      phone: member.phone,
      path: `members.${index}.email`,
    })),
  ];

  // Hashing is slow on purpose; keep it out of the serializable transaction.
  const passwordHash = await hashPassword(request.leader.password);

  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await registerOnce(request.teamName, roster, passwordHash);
    } catch (error) {
      if (isSerializationFailure(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }
}

interface RosterEntry {
  name: string;
  isLeader: boolean;
  email: string;
  university: string;
  phone: string;
  /** Request path of this email, for field-level error details. */
  path: string;
}

async function registerOnce(
  teamName: string,
  roster: RosterEntry[],
  passwordHash: string,
): Promise<TeamRegistrationResult> {
  const prisma = getPrismaClient();
  const leader = roster[0];

  const { team: created, badges } = await prisma
    .$transaction(
      async (tx) => {
        if (await tx.user.findUnique({ where: { email: leader.email }, select: { id: true } })) {
          throw ApiError.conflict(`An account with the email ${leader.email} already exists.`, [
            { path: leader.path, message: 'This email is already used by another account.' },
          ]);
        }

        if (await tx.team.findUnique({ where: { name: teamName }, select: { id: true } })) {
          throw ApiError.conflict('A team with this name is already registered.', [
            { path: 'teamName', message: 'This team name is already taken.' },
          ]);
        }

        // A person can only be on one team.
        const alreadyRegistered = await tx.participant.findMany({
          where: { email: { in: roster.map((entry) => entry.email) } },
          select: { email: true, team: { select: { name: true } } },
        });

        if (alreadyRegistered.length > 0) {
          const taken = new Set(alreadyRegistered.map((participant) => participant.email));
          const emails = [...taken].join(', ');
          throw ApiError.conflict(
            alreadyRegistered.length === 1
              ? `${emails} is already registered on another team.`
              : `These emails are already registered on other teams: ${emails}.`,
            roster
              .filter((entry) => taken.has(entry.email))
              .map((entry) => ({
                path: entry.path,
                message: 'This person is already registered on another team.',
              })),
          );
        }

        const colorCounts = await tx.participant.groupBy({
          by: ['color'],
          where: { color: { not: null } },
          _count: { _all: true },
        });
        const colors = assignBalancedColors(
          Object.fromEntries(
            colorCounts
              .filter((row) => row.color !== null)
              .map((row) => [row.color as BadgeColor, row._count._all]),
          ),
          roster.length,
        );

        const leaderAccount = await tx.user.create({
          data: {
            role: LEADER_ACCOUNT_ROLE,
            email: leader.email,
            name: leader.name,
            passwordHash,
          },
        });

        const team = await tx.team.create({
          data: {
            name: teamName,
            leaderId: leaderAccount.id,
            participants: {
              create: roster.map((entry, index) => ({
                name: entry.name,
                isLeader: entry.isLeader,
                email: entry.email,
                university: entry.university,
                phone: entry.phone,
                color: colors[index],
              })),
            },
          },
          include: {
            participants: { orderBy: [{ isLeader: 'desc' }, { name: 'asc' }] },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'registration.team_created',
            actorId: leaderAccount.id,
            targetType: 'team',
            targetId: team.id,
          },
        });

        const issuedBadges = await Promise.all(
          team.participants.map((participant) =>
            issueBadgeInTx(tx, participant.id, participant.name),
          ),
        );

        return { team, badges: issuedBadges };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
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
    leader: { id: created.leaderId, name: leader.name },
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
