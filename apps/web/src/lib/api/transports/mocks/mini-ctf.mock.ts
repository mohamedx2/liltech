import { EventPhase, TeamProgressState } from 'api-contracts';
import { devMockState } from './dev-state';
import { ApiClientError } from '../../errors';
import type {
  MiniCtfStatusResponse,
  MiniCtfSubmitRequest,
  MiniCtfSubmitResponse,
} from '../../contracts/pending';

export function handleGetMiniCtfStatus(): MiniCtfStatusResponse {
  return {
    // Gate availability is owned by the event phase, mirroring the backend rule
    // that the Mini-CTF opens for checked-in teams when the event goes live.
    isOpen: devMockState.phase === EventPhase.Live,
    isSolved: devMockState.ctf.isSolved,
    solvedAt: devMockState.ctf.solvedAt,
    attemptsCount: devMockState.ctf.attemptsCount,
    cooldownUntil: devMockState.ctf.cooldownUntil ?? null,
    hint: devMockState.ctf.hint,
  };
}

export function handleSubmitMiniCtfFlag(payload: MiniCtfSubmitRequest): MiniCtfSubmitResponse {
  if (devMockState.ctf.isSolved) {
    return {
      success: true,
      message: 'Mini-CTF already solved. Main challenge is unlocked.',
      progress: devMockState.team.progress,
      unlockedChallengeTrack: null,
    };
  }

  // Simulate server-side rate limiting after repeated failed attempts.
  if (devMockState.rateLimitAttempts >= 4) {
    const cooldown = new Date(Date.now() + 30000).toISOString();
    devMockState.ctf.cooldownUntil = cooldown;
    // reset attempts for next cycle
    devMockState.rateLimitAttempts = 0;
    throw new ApiClientError({
      message: 'Too many incorrect attempts. Rate limit engaged for 30 seconds.',
      status: 429,
      code: 'RATE_LIMITED',
    });
  }

  const cleanFlag = payload.flag ? payload.flag.trim() : '';

  if (cleanFlag.toLowerCase() === devMockState.ctf.mockAcceptableFlag.toLowerCase()) {
    devMockState.ctf.isSolved = true;
    devMockState.ctf.solvedAt = new Date().toISOString();
    devMockState.team.progress = TeamProgressState.ChallengeUnlocked;
    devMockState.rateLimitAttempts = 0;

    return {
      success: true,
      message: 'Correct flag! Your main track challenge has been unlocked.',
      progress: TeamProgressState.ChallengeUnlocked,
      unlockedChallengeTrack: null,
    };
  }

  devMockState.ctf.attemptsCount += 1;
  devMockState.rateLimitAttempts += 1;

  throw new ApiClientError({
    message: 'Incorrect flag. Please check the challenge hints and try again.',
    status: 400,
    code: 'CTF_NOT_SOLVED',
  });
}
