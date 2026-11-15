import { Prisma, type Challenge } from '@prisma/client';
import {
  challengeResourceLinkSchema,
  type AdminChallengeListResponse,
  type ChallengeAccess,
  type ChallengeAdminDetail,
  type ChallengeResourceLink,
  type ChallengeSchedule,
  type CreateChallengeRequest,
  type CurrentChallengeResponse,
  type EventPhase,
  type TeamChallengeListResponse,
  type TeamChallengeView,
  type UpdateChallengeRequest,
} from 'api-contracts';
import { z } from 'zod';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { logger } from '../../utils/logger';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { getEventState } from '../event-state/event-state.service';

/**
 * Main challenges: administration of the two challenges (content, start,
 * end) and the team view with Mini-CTF early access.
 *
 * Rules enforced here, server-side:
 * - start/end only while the event phase is `live`;
 * - one challenge live at a time, started in `position` order, and a
 *   challenge cannot start again once ended;
 * - a team reads a running challenge before `publicAt` only if it solved
 *   that challenge's Mini-CTF; from `publicAt` (or once ended) every team can.
 */

/** Phases before the event starts: nothing about challenges is shown yet. */
const PRE_EVENT_PHASES: readonly EventPhase[] = ['registration', 'checkin'];

const resourcesSchema = z.array(challengeResourceLinkSchema);

function parseResources(value: Prisma.JsonValue): ChallengeResourceLink[] {
  const parsed = resourcesSchema.safeParse(value);
  if (!parsed.success) {
    logger.error('stored challenge resources do not match the contract');
    return [];
  }
  return parsed.data;
}

function toSchedule(challenge: Challenge): ChallengeSchedule {
  return {
    id: challenge.id,
    position: challenge.position,
    title: challenge.title,
    summary: challenge.summary,
    status: challenge.status,
    startedAt: challenge.startedAt?.toISOString() ?? null,
    endedAt: challenge.endedAt?.toISOString() ?? null,
    publicAt: challenge.publicAt?.toISOString() ?? null,
    publicDelayMinutes: challenge.publicDelayMinutes,
  };
}

function toAdminDetail(
  challenge: Challenge & { _count: { ctfSolves: number } },
): ChallengeAdminDetail {
  return {
    ...toSchedule(challenge),
    description: challenge.description,
    problemStatement: challenge.problemStatement,
    deliverables: challenge.deliverables,
    resources: parseResources(challenge.resources),
    ctfSolvedTeams: challenge._count.ctfSolves,
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}

/** Pure access rule, exported for unit tests. */
export function challengeAccessFor(
  challenge: Pick<Challenge, 'status' | 'publicAt'>,
  ctfSolved: boolean,
  now: Date,
): ChallengeAccess {
  if (challenge.status === 'upcoming') {
    return 'locked';
  }
  if (challenge.status === 'ended') {
    return 'public';
  }
  if (challenge.publicAt && challenge.publicAt.getTime() <= now.getTime()) {
    return 'public';
  }
  return ctfSolved ? 'early' : 'locked';
}

function toTeamView(challenge: Challenge, ctfSolved: boolean, now: Date): TeamChallengeView {
  const access = challengeAccessFor(challenge, ctfSolved, now);

  return {
    challenge: toSchedule(challenge),
    access,
    ctfSolved,
    content:
      access === 'locked'
        ? null
        : {
            description: challenge.description,
            problemStatement: challenge.problemStatement,
            deliverables: challenge.deliverables,
            resources: parseResources(challenge.resources),
          },
  };
}

async function requireLivePhase(action: string): Promise<void> {
  const { phase } = await getEventState();
  if (phase !== 'live') {
    throw ApiError.conflict(
      `Challenges can only be ${action} while the event is live (current phase: ${phase}).`,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function listChallengesForAdmin(): Promise<AdminChallengeListResponse> {
  const prisma = getPrismaClient();
  const challenges = await prisma.challenge.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { ctfSolves: true } } },
  });
  const items = challenges.map(toAdminDetail);
  return { items, total: items.length };
}

export async function createChallenge(
  request: CreateChallengeRequest,
  adminUserId: string,
): Promise<ChallengeAdminDetail> {
  const prisma = getPrismaClient();

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.challenge.create({
        data: { ...request, resources: request.resources },
        include: { _count: { select: { ctfSolves: true } } },
      });
      await recordAuditLog(
        {
          action: AuditAction.ChallengeCreated,
          actorId: adminUserId,
          targetType: 'challenge',
          targetId: created.id,
        },
        tx,
      );
      return toAdminDetail(created);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict(`A challenge already uses position ${request.position}.`, [
        { path: 'position', message: 'This position is already taken.' },
      ]);
    }
    throw error;
  }
}

export async function updateChallenge(
  challengeId: string,
  request: UpdateChallengeRequest,
  adminUserId: string,
): Promise<ChallengeAdminDetail> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!existing) {
      throw ApiError.notFound('Challenge not found.');
    }

    // The reveal time follows a delay change while the challenge runs.
    const publicAt =
      request.publicDelayMinutes !== undefined && existing.startedAt && existing.status === 'live'
        ? new Date(existing.startedAt.getTime() + request.publicDelayMinutes * 60_000)
        : undefined;

    const updated = await tx.challenge.update({
      where: { id: challengeId },
      data: { ...request, ...(publicAt ? { publicAt } : {}) },
      include: { _count: { select: { ctfSolves: true } } },
    });
    await recordAuditLog(
      {
        action: AuditAction.ChallengeUpdated,
        actorId: adminUserId,
        targetType: 'challenge',
        targetId: challengeId,
      },
      tx,
    );
    return toAdminDetail(updated);
  });
}

export async function startChallenge(
  challengeId: string,
  adminUserId: string,
): Promise<ChallengeAdminDetail> {
  await requireLivePhase('started');
  const prisma = getPrismaClient();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
        if (!challenge) {
          throw ApiError.notFound('Challenge not found.');
        }
        if (challenge.status !== 'upcoming') {
          throw ApiError.conflict(
            challenge.status === 'live'
              ? 'This challenge is already running.'
              : 'This challenge has already ended and cannot start again.',
          );
        }

        const running = await tx.challenge.findFirst({ where: { status: 'live' } });
        if (running) {
          throw ApiError.conflict(`End "${running.title}" before starting another challenge.`);
        }

        const earlierNotEnded = await tx.challenge.findFirst({
          where: { position: { lt: challenge.position }, status: { not: 'ended' } },
          orderBy: { position: 'asc' },
        });
        if (earlierNotEnded) {
          throw ApiError.conflict(
            `"${earlierNotEnded.title}" must run and end before this challenge starts.`,
          );
        }

        const startedAt = new Date();
        const started = await tx.challenge.update({
          where: { id: challengeId },
          data: {
            status: 'live',
            startedAt,
            publicAt: new Date(startedAt.getTime() + challenge.publicDelayMinutes * 60_000),
          },
          include: { _count: { select: { ctfSolves: true } } },
        });
        await recordAuditLog(
          {
            action: AuditAction.ChallengeStarted,
            actorId: adminUserId,
            targetType: 'challenge',
            targetId: challengeId,
          },
          tx,
        );
        return toAdminDetail(started);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // The partial unique index allows a single live challenge; a concurrent
    // start lands here.
    if (
      isUniqueViolation(error) ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
    ) {
      throw ApiError.conflict('Another challenge was started at the same time. Refresh and retry.');
    }
    throw error;
  }
}

export async function endChallenge(
  challengeId: string,
  adminUserId: string,
): Promise<ChallengeAdminDetail> {
  await requireLivePhase('ended');
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const endedAt = new Date();
    const ended = await tx.challenge.updateMany({
      where: { id: challengeId, status: 'live' },
      data: { status: 'ended', endedAt },
    });

    if (ended.count === 0) {
      const existing = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!existing) {
        throw ApiError.notFound('Challenge not found.');
      }
      throw ApiError.conflict(
        existing.status === 'upcoming'
          ? 'This challenge has not started yet.'
          : 'This challenge has already ended.',
      );
    }

    await recordAuditLog(
      {
        action: AuditAction.ChallengeEnded,
        actorId: adminUserId,
        targetType: 'challenge',
        targetId: challengeId,
      },
      tx,
    );

    const challenge = await tx.challenge.findUniqueOrThrow({
      where: { id: challengeId },
      include: { _count: { select: { ctfSolves: true } } },
    });
    return toAdminDetail(challenge);
  });
}

// ── Mini-CTF integration ─────────────────────────────────────────────────────

/**
 * Whether at least one member of the team has been checked in at the
 * entrance. Organizer rule: a team with nobody checked in sees neither the
 * challenges nor the Mini-CTF; the Mini-CTF module must apply it too.
 */
export async function isTeamCheckedIn(teamId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const count = await prisma.checkInRecord.count({ where: { participant: { teamId } } });
  return count > 0;
}

/**
 * Called by the Mini-CTF module once it has validated a team's flag for a
 * challenge. Idempotent: a second solve keeps the first `solvedAt`. Returns
 * `false` when the challenge does not exist.
 */
export async function recordMiniCtfSolve(teamId: string, challengeId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true },
  });
  if (!challenge) {
    return false;
  }

  await prisma.challengeCtfSolve.upsert({
    where: { challengeId_teamId: { challengeId, teamId } },
    update: {},
    create: { challengeId, teamId },
  });
  return true;
}

// ── Team view ─────────────────────────────────────────────────────────────────

type TeamContext =
  | { available: false; response: CurrentChallengeResponse & TeamChallengeListResponse }
  | {
      available: true;
      phase: EventPhase;
      now: Date;
      challenges: Challenge[];
      solvedChallengeIds: Set<string>;
    };

async function loadTeamContext(leaderUserId: string): Promise<TeamContext> {
  const prisma = getPrismaClient();
  const { phase } = await getEventState();

  if (PRE_EVENT_PHASES.includes(phase)) {
    return {
      available: false,
      response: {
        available: false,
        reason: 'EVENT_NOT_STARTED',
        phase,
        message: "The hackathon hasn't started yet. Challenges open once the event goes live.",
      },
    };
  }

  const team = await prisma.team.findUnique({
    where: { leaderId: leaderUserId },
    select: {
      ctfSolves: { select: { challengeId: true } },
      participants: { where: { checkIn: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!team) {
    throw ApiError.notFound('No registered team found for this account.');
  }

  // Only teams present at the venue (at least one member checked in) take part.
  if (team.participants.length === 0) {
    return {
      available: false,
      response: {
        available: false,
        reason: 'NOT_CHECKED_IN',
        phase,
        message:
          'Your team has not been checked in yet. Show your QR codes at the entrance to take part in the challenges.',
      },
    };
  }

  const challenges = await prisma.challenge.findMany({ orderBy: { position: 'asc' } });

  return {
    available: true,
    phase,
    now: new Date(),
    challenges,
    solvedChallengeIds: new Set(team.ctfSolves.map((solve) => solve.challengeId)),
  };
}

export async function listChallengesForTeam(
  leaderUserId: string,
): Promise<TeamChallengeListResponse> {
  const context = await loadTeamContext(leaderUserId);
  if (!context.available) {
    return context.response;
  }

  return {
    available: true,
    phase: context.phase,
    serverTime: context.now.toISOString(),
    items: context.challenges.map((challenge) =>
      toTeamView(challenge, context.solvedChallengeIds.has(challenge.id), context.now),
    ),
  };
}

/**
 * The challenge a team should look at now: the running one, otherwise the
 * most recently ended one.
 */
export async function getCurrentChallengeForTeam(
  leaderUserId: string,
): Promise<CurrentChallengeResponse> {
  const context = await loadTeamContext(leaderUserId);
  if (!context.available) {
    return context.response;
  }

  const running = context.challenges.find((challenge) => challenge.status === 'live');
  const lastEnded = [...context.challenges]
    .filter((challenge) => challenge.status === 'ended')
    .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))[0];
  const current = running ?? lastEnded;

  if (!current) {
    return {
      available: false,
      reason: 'NO_CHALLENGE_STARTED',
      phase: context.phase,
      message: 'No challenge has started yet. Stay tuned for the announcement.',
    };
  }

  return {
    available: true,
    phase: context.phase,
    serverTime: context.now.toISOString(),
    current: toTeamView(current, context.solvedChallengeIds.has(current.id), context.now),
  };
}
