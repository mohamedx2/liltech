import type {
  CtfHintResponse,
  CtfStageResponse,
  CtfSubmitRequest,
  CtfSubmitResponse,
} from 'api-contracts';
import { TeamProgressState } from 'api-contracts';
import { ApiClientError } from '../../errors';
import { devMockState } from './dev-state';

/**
 * DEV-ONLY mock for the CTF gate. No real answer, password or hint text lives
 * here: the mock accepts one obviously fake placeholder answer so the UI flow
 * can be exercised without a backend.
 */

const MOCK_ANSWER = 'placeholder-flag';
const MOCK_HINTS = [
  'Mock hint 1 — dev only.',
  'Mock hint 2 — dev only.',
  'Mock hint 3 — dev only.',
];

let hintsUsed = 0;

export function handleGetCtfStage(): CtfStageResponse {
  return {
    stage: {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'louage-404',
      position: 1,
      title: 'Louage 404',
      description: null,
      assetImageUrl: '/ctf/step-1/louage.jpg',
      assetZipUrl: '/ctf/step-1/CTF.zip',
      hintCount: MOCK_HINTS.length,
    },
    progress: {
      isOpen: true,
      isSolved: devMockState.ctf.isSolved,
      solvedAt: devMockState.ctf.solvedAt ?? null,
      attempts: devMockState.ctf.attemptsCount,
      hintsUsed,
      mainChallengeUnlocked: devMockState.ctf.isSolved,
    },
    hints: MOCK_HINTS.slice(0, hintsUsed).map((body, index) => ({ position: index + 1, body })),
  };
}

export function handleRevealCtfHint(): CtfHintResponse {
  if (hintsUsed >= MOCK_HINTS.length) {
    throw new ApiClientError({
      message: 'All hints for this stage are already revealed.',
      status: 409,
      code: 'CONFLICT',
    });
  }

  const hint = { position: hintsUsed + 1, body: MOCK_HINTS[hintsUsed] };
  hintsUsed += 1;

  return { hint, hintsUsed, hintCount: MOCK_HINTS.length };
}

export function handleSubmitCtfAnswer(payload: CtfSubmitRequest): CtfSubmitResponse {
  if (devMockState.ctf.isSolved) {
    return {
      success: true,
      message: 'This stage is already solved. Your main challenge is unlocked.',
      isSolved: true,
      solvedAt: devMockState.ctf.solvedAt ?? new Date().toISOString(),
      mainChallengeUnlocked: true,
    };
  }

  if (payload.answer.trim().toLowerCase() !== MOCK_ANSWER) {
    devMockState.ctf.attemptsCount += 1;
    throw new ApiClientError({
      message: 'That answer is not right. Re-read the archive contents and try again.',
      status: 400,
      code: 'CTF_NOT_SOLVED',
    });
  }

  devMockState.ctf.isSolved = true;
  devMockState.ctf.solvedAt = new Date().toISOString();
  devMockState.team.progress = TeamProgressState.ChallengeUnlocked;

  return {
    success: true,
    message: 'El série t2akkdet. Your main challenge is now unlocked.',
    isSolved: true,
    solvedAt: devMockState.ctf.solvedAt,
    mainChallengeUnlocked: true,
  };
}
