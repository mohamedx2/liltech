import type {
  CtfChainResponse,
  CtfCurrentStage,
  CtfHintResponse,
  CtfStageResponse,
  CtfStageState,
  CtfSubmitRequest,
  CtfSubmitResponse,
  CtfTrackItem,
} from 'api-contracts';
import { ApiClientError } from '../../errors';

/**
 * DEV-ONLY mock for the LOUAGE 404 chain.
 *
 * It exists so the UI can be developed without a backend. It contains no real
 * answers, hints or Drive links: one obviously fake placeholder flag is
 * accepted, and every stage has the same dummy content.
 */

const MOCK_FLAG = 'placeholder-flag';

const MOCK_STAGES: readonly { slug: string; position: number; title: string }[] = [
  { slug: 'louage-404-01', position: 1, title: 'The Louage' },
  { slug: 'louage-404-02', position: 2, title: 'The Location' },
  { slug: 'louage-404-03', position: 3, title: 'The Departure' },
  { slug: 'louage-404-04', position: 4, title: 'The Invisible Message' },
  { slug: 'louage-404-05', position: 5, title: 'The Two Signatures' },
  { slug: 'louage-404-06', position: 6, title: 'The Proverb' },
  { slug: 'louage-404-07', position: 7, title: 'The Final Passenger' },
];

const MOCK_HINTS = [
  'Mock hint 1 — dev only.',
  'Mock hint 2 — dev only.',
  'Mock hint 3 — dev only.',
];

interface MockTeamState {
  solved: Set<string>;
  attempts: Record<string, number>;
  hintsUsed: Record<string, number>;
}

const state: MockTeamState = { solved: new Set(), attempts: {}, hintsUsed: {} };

function stageState(slug: string, index: number): CtfStageState {
  if (state.solved.has(slug)) return 'solved';
  const firstUnsolved = MOCK_STAGES.findIndex((stage) => !state.solved.has(stage.slug));
  return index === firstUnsolved ? 'unlocked' : 'locked';
}

function trackItem(index: number): CtfTrackItem {
  const stage = MOCK_STAGES[index];
  return {
    slug: stage.slug,
    position: stage.position,
    title: stage.title,
    state: stageState(stage.slug, index),
    status: 'live',
    requiredForUnlock: true,
  };
}

function currentStage(index: number): CtfCurrentStage {
  const stage = MOCK_STAGES[index];
  const hintsUsed = state.hintsUsed[stage.slug] ?? 0;

  return {
    stage: {
      slug: stage.slug,
      position: stage.position,
      totalStages: MOCK_STAGES.length,
      title: stage.title,
      description: 'Mock stage description — dev only.',
      status: 'live',
      state: stageState(stage.slug, index),
      assetDriveUrl: null,
      hintCount: MOCK_HINTS.length,
    },
    progress: {
      attempts: state.attempts[stage.slug] ?? 0,
      hintsUsed,
      solved: state.solved.has(stage.slug),
      solvedAt: null,
    },
    hints: MOCK_HINTS.slice(0, hintsUsed).map((body, position) => ({
      position: position + 1,
      body,
    })),
  };
}

function firstUnsolvedIndex(): number {
  return MOCK_STAGES.findIndex((stage) => !state.solved.has(stage.slug));
}

function findStageOrThrow(slug: string): { index: number } {
  const index = MOCK_STAGES.findIndex((stage) => stage.slug === slug);

  if (index < 0) {
    throw new ApiClientError({
      message: 'Unknown Mini-CTF stage.',
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  if (stageState(slug, index) === 'locked') {
    throw new ApiClientError({
      message: 'This stage is locked. Solve the previous stage first.',
      status: 403,
      code: 'STAGE_LOCKED',
    });
  }

  return { index };
}

export function handleGetCtfChain(): CtfChainResponse {
  const index = firstUnsolvedIndex();
  const solved = MOCK_STAGES.filter((stage) => state.solved.has(stage.slug)).length;

  return {
    team: { name: 'Sample Builders (Dev Mock)' },
    stages: MOCK_STAGES.map((_, stageIndex) => trackItem(stageIndex)),
    current: index >= 0 ? currentStage(index) : null,
    summary: { solved, total: MOCK_STAGES.length },
    eligible: true,
  };
}

export function handleGetCtfStage(slug: string): CtfStageResponse {
  const { index } = findStageOrThrow(slug);
  return currentStage(index);
}

export function handleRevealCtfHint(slug: string): CtfHintResponse {
  findStageOrThrow(slug);
  const hintsUsed = state.hintsUsed[slug] ?? 0;

  if (hintsUsed >= MOCK_HINTS.length) {
    throw new ApiClientError({
      message: 'All hints for this stage are already revealed.',
      status: 409,
      code: 'CONFLICT',
    });
  }

  state.hintsUsed[slug] = hintsUsed + 1;

  return {
    hint: { position: hintsUsed + 1, body: MOCK_HINTS[hintsUsed] },
    hintsUsed: hintsUsed + 1,
    hintCount: MOCK_HINTS.length,
  };
}

export function handleSubmitCtfAnswer(slug: string, payload: CtfSubmitRequest): CtfSubmitResponse {
  const { index } = findStageOrThrow(slug);
  const stage = MOCK_STAGES[index];

  if (state.solved.has(slug)) {
    return {
      correct: true,
      stageSolved: true,
      stageSlug: slug,
      nextStageUnlocked: index + 1 < MOCK_STAGES.length,
      nextStagePosition: MOCK_STAGES[index + 1]?.position ?? null,
      completedChain: state.solved.size === MOCK_STAGES.length,
      message: `Stage ${stage.position} is already solved.`,
    };
  }

  if (payload.answer.trim().toLowerCase() !== MOCK_FLAG) {
    state.attempts[slug] = (state.attempts[slug] ?? 0) + 1;
    throw new ApiClientError({
      message: 'Incorrect flag. Try again.',
      status: 400,
      code: 'CTF_NOT_SOLVED',
    });
  }

  state.solved.add(slug);
  const completed = state.solved.size === MOCK_STAGES.length;

  return {
    correct: true,
    stageSolved: true,
    stageSlug: slug,
    nextStageUnlocked: index + 1 < MOCK_STAGES.length,
    nextStagePosition: MOCK_STAGES[index + 1]?.position ?? null,
    completedChain: completed,
    message: completed
      ? 'Investigation complete. You were the missing passenger all along.'
      : 'Correct flag. The next stage is unlocked.',
  };
}
