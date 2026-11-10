import { TeamProgressState } from 'api-contracts';
import { devMockState } from './dev-state';
import { ApiClientError } from '../../errors';
import type { ChallengeDetailResponse } from '../../contracts/pending';

export function handleGetCurrentChallenge(): ChallengeDetailResponse {
  const isUnlocked =
    devMockState.ctf.isSolved ||
    devMockState.team.progress === TeamProgressState.CtfSolved ||
    devMockState.team.progress === TeamProgressState.ChallengeUnlocked ||
    devMockState.team.progress === TeamProgressState.Submitted;

  if (!isUnlocked) {
    throw new ApiClientError({
      message: 'Challenge track locked. You must solve the Mini-CTF first.',
      status: 403,
      code: 'CTF_NOT_SOLVED',
    });
  }

  return devMockState.challenge;
}
