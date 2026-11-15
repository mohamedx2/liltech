import { getPrismaClient } from '../../config/database';
import { ApiError, ApiErrorCode } from '../../utils/api-error';
import { createRateLimiter } from '../../utils/rate-limiter';
import type {
  CtfHintResponse,
  CtfStageResponse,
  CtfSubmitResponse,
  CtfTeamProgress,
} from 'api-contracts';
import { matchesAnswerHash } from './ctf-answer';

/**
 * Mini-CTF gate service.
 *
 * Rules that must hold on the server (never on the client):
 * - Only a *live* stage accepts answers, and only for a team that has checked in.
 * - A correct answer unlocks the main challenge exactly once, idempotently.
 * - Repeated submissions are rate limited per team.
 * - The answer is compared by hash; the plaintext is never stored or returned.
 *
 * Progress is tracked per team, because only a team's leader has an account
 * (participants authenticate via their QR badge at the desk, not online).
 */

/** Canonical team progress order from the specification. */
const PROGRESS_ORDER = [
  'registered',
  'checked_in',
  'ctf_unlocked',
  'ctf_solved',
  'challenge_unlocked',
  'submitted',
] as const;

type ProgressState = (typeof PROGRESS_ORDER)[number];

/** Five submissions per minute per team; enough for typos, hostile to guessing. */
const submitLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

interface TeamContext {
  id: string;
  progressState: ProgressState;
}

async function requireTeamForUser(userId: string): Promise<TeamContext> {
  const prisma = getPrismaClient();
  const team = await prisma.team.findUnique({
    where: { leaderId: userId },
    select: { id: true, progressState: true },
  });

  if (!team) {
    throw ApiError.notFound('This account is not linked to a team.');
  }

  return { id: team.id, progressState: team.progressState as ProgressState };
}

async function loadCurrentStage() {
  const prisma = getPrismaClient();
  const stage = await prisma.ctfStage.findFirst({
    where: { status: 'live' },
    orderBy: { position: 'asc' },
    include: { hints: { orderBy: { position: 'asc' }, select: { position: true, body: true } } },
  });

  if (!stage) {
    throw ApiError.notFound('No Mini-CTF stage is open right now.');
  }

  return stage;
}

function hasCheckedIn(state: ProgressState): boolean {
  return PROGRESS_ORDER.indexOf(state) >= PROGRESS_ORDER.indexOf('checked_in');
}

function buildProgress(
  team: TeamContext,
  isOpen: boolean,
  solvedAt: Date | null,
  attempts: number,
  hintsUsed: number,
): CtfTeamProgress {
  return {
    isOpen,
    isSolved: solvedAt !== null,
    solvedAt: solvedAt?.toISOString() ?? null,
    attempts,
    hintsUsed,
    mainChallengeUnlocked:
      solvedAt !== null ||
      PROGRESS_ORDER.indexOf(team.progressState) >= PROGRESS_ORDER.indexOf('challenge_unlocked'),
  };
}

export async function getStageForTeam(userId: string): Promise<CtfStageResponse> {
  const prisma = getPrismaClient();
  const team = await requireTeamForUser(userId);
  const stage = await loadCurrentStage();

  const progress = await prisma.ctfProgress.findUnique({
    where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
  });

  const isOpen = stage.status === 'live' && hasCheckedIn(team.progressState);
  const hintsUsed = progress?.hintsUsed ?? 0;

  return {
    stage: {
      id: stage.id,
      slug: stage.slug,
      position: stage.position,
      title: stage.title,
      description: stage.description,
      assetImageUrl: stage.assetImageUrl,
      assetZipUrl: stage.assetZipUrl,
      hintCount: stage.hints.length,
    },
    progress: buildProgress(
      team,
      isOpen,
      progress?.solvedAt ?? null,
      progress?.attempts ?? 0,
      hintsUsed,
    ),
    // Only hints the team has already paid for are ever serialized.
    hints: stage.hints.slice(0, hintsUsed).map((hint) => ({
      position: hint.position,
      body: hint.body,
    })),
  };
}

export async function revealNextHint(userId: string): Promise<CtfHintResponse> {
  const prisma = getPrismaClient();
  const team = await requireTeamForUser(userId);
  const stage = await loadCurrentStage();

  if (!hasCheckedIn(team.progressState)) {
    throw ApiError.forbidden('Check in at the desk before opening the Mini-CTF.');
  }

  const progress = await prisma.ctfProgress.findUnique({
    where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
  });

  if (progress?.solvedAt) {
    throw ApiError.conflict('This stage is already solved.');
  }

  const hintsUsed = progress?.hintsUsed ?? 0;
  const next = stage.hints[hintsUsed];

  if (!next) {
    throw ApiError.conflict('All hints for this stage are already revealed.');
  }

  const updated = await prisma.ctfProgress.upsert({
    where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
    update: { hintsUsed: next.position },
    create: { teamId: team.id, stageId: stage.id, hintsUsed: next.position },
  });

  return {
    hint: { position: next.position, body: next.body },
    hintsUsed: updated.hintsUsed,
    hintCount: stage.hints.length,
  };
}

export async function submitAnswer(userId: string, answer: string): Promise<CtfSubmitResponse> {
  const prisma = getPrismaClient();
  const team = await requireTeamForUser(userId);
  const stage = await loadCurrentStage();

  const existing = await prisma.ctfProgress.findUnique({
    where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
  });

  // Idempotent replay: a solved team gets the same answer, without burning
  // an attempt or a rate-limit slot.
  if (existing?.solvedAt) {
    return {
      success: true,
      message: 'This stage is already solved. Your main challenge is unlocked.',
      isSolved: true,
      solvedAt: existing.solvedAt.toISOString(),
      mainChallengeUnlocked: true,
    };
  }

  if (!hasCheckedIn(team.progressState)) {
    throw ApiError.forbidden('Check in at the desk before submitting a Mini-CTF answer.');
  }

  const limit = submitLimiter.check(`ctf-submit:${team.id}`);

  if (!limit.ok) {
    await prisma.ctfAttempt.create({
      data: { teamId: team.id, stageId: stage.id, outcome: 'rate_limited' },
    });

    const retryAfterSeconds = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));

    throw new ApiError(
      ApiErrorCode.RATE_LIMITED,
      `Too many submissions. Try again in ${retryAfterSeconds}s.`,
      429,
      { retryAfterSeconds },
    );
  }

  if (!matchesAnswerHash(answer, stage.answerHash)) {
    await prisma.$transaction([
      prisma.ctfProgress.upsert({
        where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
        update: { attempts: { increment: 1 } },
        create: { teamId: team.id, stageId: stage.id, attempts: 1 },
      }),
      prisma.ctfAttempt.create({
        data: { teamId: team.id, stageId: stage.id, outcome: 'incorrect' },
      }),
    ]);

    throw new ApiError(
      ApiErrorCode.CTF_NOT_SOLVED,
      'That answer is not right. Re-read the archive contents and try again.',
      400,
    );
  }

  const solvedAt = await prisma.$transaction(async (tx) => {
    const now = new Date();

    const progress = await tx.ctfProgress.upsert({
      where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
      update: { solvedAt: now, attempts: { increment: 1 } },
      create: { teamId: team.id, stageId: stage.id, solvedAt: now, attempts: 1 },
    });

    // Unlock the main challenge, but never move a team's progress backwards.
    await tx.team.updateMany({
      where: {
        id: team.id,
        progressState: { in: ['registered', 'checked_in', 'ctf_unlocked', 'ctf_solved'] },
      },
      data: { progressState: 'challenge_unlocked' },
    });

    await tx.ctfAttempt.create({
      data: { teamId: team.id, stageId: stage.id, outcome: 'correct' },
    });

    await tx.auditLog.create({
      data: {
        action: 'ctf.stage_solved',
        actorId: userId,
        targetType: 'ctf_stage',
        targetId: stage.id,
      },
    });

    return progress.solvedAt ?? now;
  });

  return {
    success: true,
    message: 'El série t2akkdet. Your main challenge is now unlocked.',
    isSolved: true,
    solvedAt: solvedAt.toISOString(),
    mainChallengeUnlocked: true,
  };
}

/**
 * Gate check for downstream challenge material: the main challenge is only
 * readable once this team has solved the live gate stage.
 */
export async function hasUnlockedMainChallenge(userId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const team = await requireTeamForUser(userId);

  if (PROGRESS_ORDER.indexOf(team.progressState) >= PROGRESS_ORDER.indexOf('challenge_unlocked')) {
    return true;
  }

  const solved = await prisma.ctfProgress.findFirst({
    where: { teamId: team.id, solvedAt: { not: null } },
    select: { id: true },
  });

  return solved !== null;
}
