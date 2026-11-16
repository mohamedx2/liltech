import { getPrismaClient } from '../../config/database';
import { ApiError, ApiErrorCode } from '../../utils/api-error';
import { createRateLimiter } from '../../utils/rate-limiter';
import type {
  CtfChainResponse,
  CtfCurrentStage,
  CtfHintResponse,
  CtfStageDetail,
  CtfStageProgress,
  CtfStageState,
  CtfSubmitResponse,
  CtfTrackItem,
} from 'api-contracts';
import { matchesAnswerHash } from './ctf-answer';

/**
 * LOUAGE 404 chain service.
 *
 * The stage chain is strictly sequential and every decision is made here:
 * eligibility, which stage a team may view, whether a submission is accepted,
 * and when the main challenge unlocks. The client only renders the answer.
 *
 * Progress is per team (only a team's leader has an account).
 */

const PROGRESS_ORDER = [
  'registered',
  'checked_in',
  'ctf_unlocked',
  'ctf_solved',
  'challenge_unlocked',
  'submitted',
] as const;

type ProgressState = (typeof PROGRESS_ORDER)[number];

/**
 * Five submissions per minute per team **per stage**. Per-stage windows keep
 * guessing hostile while still letting a fast team solve several stages in a
 * row — a shared budget would reject a legitimately correct sixth answer.
 */
const submitLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

interface TeamContext {
  id: string;
  name: string;
  progressState: ProgressState;
}

interface StageRow {
  id: string;
  slug: string;
  position: number;
  title: string;
  description: string | null;
  status: 'draft' | 'live' | 'closed';
  answerHash: string | null;
  assetDriveUrl: string | null;
  requiredForUnlock: boolean;
  hints: { position: number; body: string }[];
}

interface ProgressRow {
  stageId: string;
  state: CtfStageState;
  attempts: number;
  hintsUsed: number;
  solvedAt: Date | null;
}

async function requireTeamForUser(userId: string): Promise<TeamContext> {
  const prisma = getPrismaClient();
  const team = await prisma.team.findUnique({
    where: { leaderId: userId },
    select: { id: true, name: true, progressState: true },
  });

  if (!team) {
    throw ApiError.notFound('This account is not linked to a team.');
  }

  return {
    id: team.id,
    name: team.name,
    progressState: team.progressState as ProgressState,
  };
}

function teamIsEligible(state: ProgressState): boolean {
  return PROGRESS_ORDER.indexOf(state) >= PROGRESS_ORDER.indexOf('checked_in');
}

async function loadChain(): Promise<StageRow[]> {
  const prisma = getPrismaClient();

  return prisma.ctfStage.findMany({
    orderBy: { position: 'asc' },
    select: {
      id: true,
      slug: true,
      position: true,
      title: true,
      description: true,
      status: true,
      answerHash: true,
      assetDriveUrl: true,
      requiredForUnlock: true,
      hints: { orderBy: { position: 'asc' }, select: { position: true, body: true } },
    },
  });
}

async function loadProgress(teamId: string): Promise<Map<string, ProgressRow>> {
  const prisma = getPrismaClient();
  const rows = await prisma.ctfProgress.findMany({
    where: { teamId },
    select: {
      stageId: true,
      state: true,
      attempts: true,
      hintsUsed: true,
      solvedAt: true,
    },
  });

  return new Map(rows.map((row) => [row.stageId, row]));
}

/**
 * Resolves a stage's state for one team. Stage 1 is unlocked implicitly for a
 * checked-in team; every other stage is unlocked only by solving its predecessor.
 */
function resolveState(
  stage: StageRow,
  index: number,
  progress: Map<string, ProgressRow>,
  eligible: boolean,
): CtfStageState {
  const row = progress.get(stage.id);

  if (row?.solvedAt) {
    return 'solved';
  }

  if (row && row.state === 'unlocked') {
    return 'unlocked';
  }

  if (index === 0 && eligible && (!row || row.state === 'locked')) {
    return 'unlocked';
  }

  return 'locked';
}

/** Persists the implicit Stage 1 unlock so the row exists for later updates. */
async function persistImplicitUnlock(teamId: string, stageId: string): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.ctfProgress.createMany({
    data: [{ teamId, stageId, state: 'unlocked' }],
    skipDuplicates: true,
  });
}

function toDetail(stage: StageRow, state: CtfStageState, totalStages: number): CtfStageDetail {
  return {
    slug: stage.slug,
    position: stage.position,
    totalStages,
    title: stage.title,
    description: stage.description,
    status: stage.status,
    state,
    assetDriveUrl: stage.assetDriveUrl,
    hintCount: stage.hints.length,
  };
}

function toProgress(row: ProgressRow | undefined): CtfStageProgress {
  return {
    attempts: row?.attempts ?? 0,
    hintsUsed: row?.hintsUsed ?? 0,
    solved: Boolean(row?.solvedAt),
    solvedAt: row?.solvedAt?.toISOString() ?? null,
  };
}

function stageView(
  stage: StageRow,
  state: CtfStageState,
  row: ProgressRow | undefined,
  totalStages: number,
): CtfCurrentStage {
  const hintsUsed = row?.hintsUsed ?? 0;

  return {
    stage: toDetail(stage, state, totalStages),
    progress: toProgress(row),
    hints: stage.hints.slice(0, hintsUsed).map((hint) => ({
      position: hint.position,
      body: hint.body,
    })),
  };
}

/** Index of the stage the team should work on: first unsolved *unlocked* one. */
function findCurrentIndex(
  chain: StageRow[],
  progress: Map<string, ProgressRow>,
  eligible: boolean,
): number {
  return chain.findIndex(
    (stage, index) => resolveState(stage, index, progress, eligible) === 'unlocked',
  );
}

function buildTrack(
  chain: StageRow[],
  progress: Map<string, ProgressRow>,
  eligible: boolean,
): CtfTrackItem[] {
  return chain.map((stage, index) => ({
    slug: stage.slug,
    position: stage.position,
    title: stage.title,
    state: resolveState(stage, index, progress, eligible),
    status: stage.status,
    requiredForUnlock: stage.requiredForUnlock,
  }));
}

export async function getChain(userId: string): Promise<CtfChainResponse> {
  const team = await requireTeamForUser(userId);
  const eligible = teamIsEligible(team.progressState);
  const chain = await loadChain();
  const progress = await loadProgress(team.id);

  const currentIndex = findCurrentIndex(chain, progress, eligible);
  const currentStage = currentIndex >= 0 ? chain[currentIndex] : undefined;

  if (currentStage && !progress.has(currentStage.id)) {
    await persistImplicitUnlock(team.id, currentStage.id);
    progress.set(currentStage.id, {
      stageId: currentStage.id,
      state: 'unlocked',
      attempts: 0,
      hintsUsed: 0,
      solvedAt: null,
    });
  }

  const stages = buildTrack(chain, progress, eligible);
  const solvedCount = stages.filter((stage) => stage.state === 'solved').length;

  return {
    team: { name: team.name },
    stages,
    current:
      currentStage && currentIndex >= 0
        ? stageView(currentStage, 'unlocked', progress.get(currentStage.id), chain.length)
        : null,
    summary: { solved: solvedCount, total: stages.length },
    eligible,
  };
}

async function loadStageForTeam(
  userId: string,
  slug: string,
): Promise<{
  team: TeamContext;
  chain: StageRow[];
  index: number;
  stage: StageRow;
  state: CtfStageState;
  progress: ProgressRow | undefined;
  eligible: boolean;
}> {
  const team = await requireTeamForUser(userId);
  const chain = await loadChain();
  const index = chain.findIndex((stage) => stage.slug === slug);

  if (index < 0) {
    throw ApiError.notFound('Unknown Mini-CTF stage.');
  }

  const stage = chain[index];
  const progressRows = await loadProgress(team.id);
  const eligible = teamIsEligible(team.progressState);
  const state = resolveState(stage, index, progressRows, eligible);

  if (state === 'locked') {
    throw ApiError.forbidden('This stage is locked. Solve the previous stage first.');
  }

  return {
    team,
    chain,
    index,
    stage,
    state,
    progress: progressRows.get(stage.id),
    eligible,
  };
}

export async function getStage(userId: string, slug: string): Promise<CtfCurrentStage> {
  const { stage, chain, state, progress } = await loadStageForTeam(userId, slug);

  return stageView(stage, state, progress, chain.length);
}

export async function revealNextHint(userId: string, slug: string): Promise<CtfHintResponse> {
  const prisma = getPrismaClient();
  const { stage, team, progress } = await loadStageForTeam(userId, slug);

  if (stage.status !== 'live') {
    throw new ApiError(
      ApiErrorCode.STAGE_NOT_PUBLISHED,
      'This stage is not published yet. Hints are unavailable.',
      403,
    );
  }

  if (progress?.solvedAt) {
    throw ApiError.conflict('This stage is already solved.');
  }

  const hintsUsed = progress?.hintsUsed ?? 0;
  const next = stage.hints[hintsUsed];

  if (!next) {
    throw ApiError.conflict('All hints for this stage are already revealed.');
  }

  await prisma.ctfProgress.createMany({
    data: [{ teamId: team.id, stageId: stage.id, state: 'unlocked' }],
    skipDuplicates: true,
  });

  const updated = await prisma.ctfProgress.update({
    where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
    data: { hintsUsed: next.position, state: 'unlocked' },
  });

  return {
    hint: { position: next.position, body: next.body },
    hintsUsed: updated.hintsUsed,
    hintCount: stage.hints.length,
  };
}

async function chainCompleted(teamId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  const required = await prisma.ctfStage.findMany({
    where: { requiredForUnlock: true },
    select: { id: true },
  });

  if (required.length === 0) {
    return false;
  }

  const solved = await prisma.ctfProgress.count({
    where: {
      teamId,
      solvedAt: { not: null },
      stageId: { in: required.map((stage) => stage.id) },
    },
  });

  return solved === required.length;
}

export async function submitAnswer(
  userId: string,
  slug: string,
  answer: string,
): Promise<CtfSubmitResponse> {
  const prisma = getPrismaClient();
  const { stage, team, chain, index, progress } = await loadStageForTeam(userId, slug);

  if (stage.status !== 'live') {
    throw new ApiError(
      ApiErrorCode.STAGE_NOT_PUBLISHED,
      'This stage is not published yet. Submissions are closed.',
      403,
    );
  }

  if (!stage.answerHash) {
    throw new ApiError(
      ApiErrorCode.STAGE_NOT_CONFIGURED,
      'This stage has no answer configured. Tell an organizer.',
      409,
    );
  }

  const nextStage = chain[index + 1];

  // Replay of an already-solved stage: same result, no new solve, no unlock row.
  if (progress?.solvedAt) {
    return {
      correct: true,
      stageSolved: true,
      stageSlug: stage.slug,
      nextStageUnlocked: Boolean(nextStage),
      nextStagePosition: nextStage?.position ?? null,
      completedChain: await chainCompleted(team.id),
      message: `Stage ${stage.position} is already solved.`,
    };
  }

  const limit = submitLimiter.check(`ctf-submit:${team.id}:${stage.id}`);

  if (!limit.ok) {
    await prisma.ctfAttempt.create({
      data: { teamId: team.id, stageId: stage.id, outcome: 'rate_limited' },
    });

    const retryAfterSeconds = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));

    throw new ApiError(
      ApiErrorCode.RATE_LIMITED,
      `Too many attempts. Try again in ${retryAfterSeconds}s.`,
      429,
      { retryAfterSeconds },
    );
  }

  // Ensure the row exists so the solve below is a single atomic update.
  // `createMany ... skipDuplicates` compiles to `ON CONFLICT DO NOTHING`, so two
  // submissions arriving together cannot race into a P2002 like an `upsert` can.
  await prisma.ctfProgress.createMany({
    data: [{ teamId: team.id, stageId: stage.id, state: 'unlocked' }],
    skipDuplicates: true,
  });

  if (!matchesAnswerHash(answer, stage.answerHash)) {
    await prisma.$transaction([
      prisma.ctfProgress.update({
        where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
        data: { attempts: { increment: 1 } },
      }),
      prisma.ctfAttempt.create({
        data: { teamId: team.id, stageId: stage.id, outcome: 'incorrect' },
      }),
    ]);

    throw new ApiError(ApiErrorCode.CTF_NOT_SOLVED, 'Incorrect flag. Try again.', 400);
  }

  const solvedNow = await prisma.$transaction(async (tx) => {
    const now = new Date();

    // Atomic guard: only one concurrent submission can flip solvedAt.
    const claimed = await tx.ctfProgress.updateMany({
      where: { teamId: team.id, stageId: stage.id, solvedAt: null },
      data: { state: 'solved', solvedAt: now, attempts: { increment: 1 } },
    });

    if (claimed.count === 0) {
      return false;
    }

    if (nextStage) {
      await tx.ctfProgress.createMany({
        data: [{ teamId: team.id, stageId: nextStage.id, state: 'unlocked' }],
        skipDuplicates: true,
      });
      await tx.ctfProgress.updateMany({
        where: { teamId: team.id, stageId: nextStage.id, solvedAt: null },
        data: { state: 'unlocked' },
      });
    }

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

    const required = await tx.ctfStage.findMany({
      where: { requiredForUnlock: true },
      select: { id: true },
    });

    const solvedCount = await tx.ctfProgress.count({
      where: {
        teamId: team.id,
        solvedAt: { not: null },
        stageId: { in: required.map((item) => item.id) },
      },
    });

    if (required.length > 0 && solvedCount === required.length) {
      await tx.team.updateMany({
        where: { id: team.id, progressState: { notIn: ['challenge_unlocked', 'submitted'] } },
        data: { progressState: 'challenge_unlocked' },
      });
    }

    return true;
  });

  if (!solvedNow) {
    return {
      correct: true,
      stageSolved: true,
      stageSlug: stage.slug,
      nextStageUnlocked: Boolean(nextStage),
      nextStagePosition: nextStage?.position ?? null,
      completedChain: await chainCompleted(team.id),
      message: `Stage ${stage.position} is already solved.`,
    };
  }

  const completed = await chainCompleted(team.id);

  return {
    correct: true,
    stageSolved: true,
    stageSlug: stage.slug,
    nextStageUnlocked: Boolean(nextStage),
    nextStagePosition: nextStage?.position ?? null,
    completedChain: completed,
    message: completed
      ? 'Investigation complete. You were the missing passenger all along.'
      : 'Correct flag. The next stage is unlocked.',
  };
}

/** The main challenge opens only when every required stage is solved. */
export async function hasUnlockedMainChallenge(userId: string): Promise<boolean> {
  const team = await requireTeamForUser(userId);

  if (PROGRESS_ORDER.indexOf(team.progressState) >= PROGRESS_ORDER.indexOf('challenge_unlocked')) {
    return true;
  }

  return chainCompleted(team.id);
}
