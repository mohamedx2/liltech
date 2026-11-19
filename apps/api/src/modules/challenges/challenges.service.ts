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
import { loadPhaseGate, type ParticipantPhaseGate } from '../event-state/phase-gate';

/**
 * Main challenges: administration of the two challenges (content, start,
 * end) and the team view with Mini-CTF early access.
 *
 * Rules enforced here, server-side:
 * - start/end only while the event phase is `live`;
 * - one challenge live at a time, started in `position` order, and a
 *   challenge cannot start again once ended;
 * - the first challenge opens early for a team that cleared the Mini-CTF chain,
 *   and to every team once `ctfStartedAt + 60 min` passed (or an administrator
 *   force-opened it);
 * - the second challenge opens to everyone when administrators start it;
 * - submissions stop when the event leaves `live`, when the challenge ends, or
 *   at the organizer-set `submissionDeadline`.
 */

/** Phases before the event starts: nothing about challenges is shown yet. */
const PRE_EVENT_PHASES: readonly EventPhase[] = ['registration', 'checkin'];

/**
 * Team progress states that mean the LOUAGE 404 chain is finished. `modules/ctf`
 * writes these once every required stage is solved; from then on the team counts
 * as Mini-CTF solved for every challenge.
 *
 * `submitted` is deliberately absent: `modules/submissions` writes it for any
 * deliverable, including Challenge 01 opened through the 60-minute fallback, and
 * such a team has not solved the Mini-CTF. The authoritative signal is
 * `Team.ctfSolvedAt`, written only when the chain completes.
 */
const CHAIN_COMPLETED_STATES: ReadonlySet<string> = new Set(['challenge_unlocked']);

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
    submissionDeadline: challenge.submissionDeadline?.toISOString() ?? null,
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
    forceOpenedAt: challenge.forceOpenedAt?.toISOString() ?? null,
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}

/** Unlock inputs shared by every challenge of one team at one instant. */
export interface ChallengeUnlockContext {
  gate: ParticipantPhaseGate;
  ctfSolved: boolean;
  now: Date;
}

/**
 * Pure access rule, exported for unit tests.
 *
 * - `upcoming` → locked; `ended` → public;
 * - the second challenge is public as soon as administrators start it;
 * - the first challenge is `early` for a team that cleared the Mini-CTF, and
 *   public once the 60-minute fallback or a force-open applies (or `publicAt`);
 * - otherwise locked.
 */
export function challengeAccessFor(
  challenge: Pick<Challenge, 'status' | 'publicAt' | 'position' | 'forceOpenedAt'>,
  context: ChallengeUnlockContext,
): ChallengeAccess {
  if (challenge.status === 'upcoming') {
    return 'locked';
  }
  if (challenge.status === 'ended') {
    return 'public';
  }
  // Challenge 02 is opened for everyone by starting it (administrator action).
  if (challenge.position > 1) {
    return 'public';
  }
  if (context.ctfSolved) {
    return 'early';
  }
  if (challenge.forceOpenedAt || context.gate.ctfFallbackUnlocked) {
    return 'public';
  }
  if (challenge.publicAt && challenge.publicAt.getTime() <= context.now.getTime()) {
    return 'public';
  }
  return 'locked';
}

/** The instant the first challenge opens to every team (for the countdown). */
function unlocksAtFor(challenge: Challenge, gate: ParticipantPhaseGate): Date | null {
  if (challenge.status !== 'live' || challenge.position > 1) {
    return null;
  }
  if (challenge.forceOpenedAt || gate.ctfFallbackUnlocked) {
    return null;
  }

  const candidates = [challenge.publicAt, gate.ctfClosesAt].filter(
    (value): value is Date => value instanceof Date,
  );

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.min(...candidates.map((value) => value.getTime())));
}

function submissionOpenFor(
  challenge: Challenge,
  access: ChallengeAccess,
  gate: ParticipantPhaseGate,
): boolean {
  if (challenge.status !== 'live' || access === 'locked' || !gate.submissionsOpen) {
    return false;
  }

  return (
    !challenge.submissionDeadline ||
    challenge.submissionDeadline.getTime() > gate.serverTime.getTime()
  );
}

/** Schedule mapper shared with the submissions module. */
export const toChallengeSchedule = toSchedule;

function toTeamView(
  challenge: Challenge,
  ctfSolved: boolean,
  context: ChallengeUnlockContext,
): TeamChallengeView {
  const access = challengeAccessFor(challenge, context);
  const forcedOpen = challenge.forceOpenedAt !== null;

  return {
    challenge: toSchedule(challenge),
    access,
    ctfSolved,
    unlocksAt:
      access === 'locked' ? (unlocksAtFor(challenge, context.gate)?.toISOString() ?? null) : null,
    forcedOpen,
    submissionOpen: submissionOpenFor(challenge, access, context.gate),
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

    // `submissionDeadline` arrives as an ISO string; `null` clears it.
    const { submissionDeadline, ...rest } = request;
    const deadline =
      submissionDeadline === undefined
        ? {}
        : { submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null };

    const updated = await tx.challenge.update({
      where: { id: challengeId },
      data: { ...rest, ...deadline, ...(publicAt ? { publicAt } : {}) },
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

/**
 * Administrative override: opens a challenge to every checked-in team now.
 * Idempotent — the first instant is kept. Audited.
 */
export async function forceOpenChallenge(
  challengeId: string,
  adminUserId: string,
): Promise<ChallengeAdminDetail> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!existing) {
      throw ApiError.notFound('Challenge not found.');
    }
    if (existing.status === 'upcoming') {
      throw ApiError.conflict('Start the challenge before opening it to every team.');
    }

    const opened = await tx.challenge.update({
      where: { id: challengeId },
      data: { forceOpenedAt: existing.forceOpenedAt ?? new Date() },
      include: { _count: { select: { ctfSolves: true } } },
    });
    await recordAuditLog(
      {
        action: AuditAction.ChallengeForceOpened,
        actorId: adminUserId,
        targetType: 'challenge',
        targetId: challengeId,
      },
      tx,
    );
    return toAdminDetail(opened);
  });
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
      gate: ParticipantPhaseGate;
      now: Date;
      challenges: Challenge[];
      solvedChallengeIds: Set<string>;
    };

async function loadTeamContext(leaderUserId: string): Promise<TeamContext> {
  const prisma = getPrismaClient();
  const gate = await loadPhaseGate();
  const { phase } = gate;

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
      status: true,
      progressState: true,
      ctfSolvedAt: true,
      ctfSolves: { select: { challengeId: true } },
      participants: { where: { checkIn: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!team) {
    throw ApiError.notFound('No registered team found for this account.');
  }
  if (team.status !== 'active') {
    throw ApiError.forbidden(
      `Your team is ${team.status} and cannot access challenges. Please contact the organizers.`,
    );
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

  // Single source of truth for the Mini-CTF is the LOUAGE 404 chain: a team that
  // cleared every required stage has `ctfSolvedAt` set (and legacy
  // `challenge_unlocked` progress), which unlocks every challenge it can see,
  // whatever the per-challenge solve rows say. Submitting a deliverable marks the
  // team `submitted` without implying a CTF solve.
  const chainCompleted =
    team.ctfSolvedAt !== null || CHAIN_COMPLETED_STATES.has(team.progressState);

  return {
    available: true,
    phase,
    gate,
    now: gate.serverTime,
    challenges,
    solvedChallengeIds: chainCompleted
      ? new Set(challenges.map((challenge) => challenge.id))
      : new Set(team.ctfSolves.map((solve) => solve.challengeId)),
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
      toTeamView(challenge, context.solvedChallengeIds.has(challenge.id), {
        gate: context.gate,
        ctfSolved: context.solvedChallengeIds.has(challenge.id),
        now: context.now,
      }),
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
    current: toTeamView(current, context.solvedChallengeIds.has(current.id), {
      gate: context.gate,
      ctfSolved: context.solvedChallengeIds.has(current.id),
      now: context.now,
    }),
  };
}
