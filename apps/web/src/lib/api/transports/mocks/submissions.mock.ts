import type {
  ChallengeSchedule,
  ChallengeSubmissionState,
  CreateSubmissionRequest,
  SubmissionItem,
  SubmissionsOverviewResponse,
} from 'api-contracts';
import { devMockState } from './dev-state';

/**
 * DEV-ONLY mock for the link submissions.
 *
 * It exists so the participant UI can be developed without a backend. It never
 * decides business rules: the real API does. It only fakes an open challenge 01
 * and a not-yet-open challenge 02.
 */

const CHALLENGE_01_ID = '11111111-1111-4111-8111-111111111111';
const CHALLENGE_02_ID = '22222222-2222-4222-8222-222222222222';

const history: SubmissionItem[] = [];

function isoNow(): string {
  return new Date().toISOString();
}

function schedule(position: number, title: string, id: string): ChallengeSchedule {
  return {
    id,
    position,
    title,
    summary: `Mock teaser for challenge ${position}.`,
    status: position === 1 ? 'live' : 'upcoming',
    startedAt: position === 1 ? isoNow() : null,
    endedAt: null,
    publicAt: null,
    publicDelayMinutes: 60,
    submissionDeadline: null,
  };
}

function stateFor(position: number, title: string, id: string): ChallengeSubmissionState {
  const own = history.filter((item) => item.challengePosition === position);
  const current = own[0] ?? null;

  return {
    challenge: schedule(position, title, id),
    access: position === 1 ? 'public' : 'locked',
    canSubmit: position === 1,
    blockedReason: position === 1 ? null : 'CHALLENGE_LOCKED',
    current,
    history: own,
  };
}

export function handleGetSubmissionsOverview(): SubmissionsOverviewResponse {
  // Both challenges are always listed, whatever the mock phase.
  void devMockState.phase;

  return {
    phase: devMockState.phase,
    serverTime: isoNow(),
    items: [
      stateFor(1, 'Challenge 01 — Poster, logo, teaser', CHALLENGE_01_ID),
      stateFor(2, 'Challenge 02 — Technical project', CHALLENGE_02_ID),
    ],
  };
}

export function handleCreateSubmission(payload: CreateSubmissionRequest): SubmissionItem {
  const isFirst = payload.challengePosition === 1;

  if (!isFirst) {
    // Challenge 02 is closed in the mock so the blocked state stays visible.
    throw new Error('Challenge 02 is not open in the dev mock.');
  }

  const created: SubmissionItem = {
    id: `55555555-5555-4555-8555-${String(history.length + 1).padStart(12, '0')}`,
    challengeId: CHALLENGE_01_ID,
    challengePosition: 1,
    driveUrl: payload.driveUrl,
    githubUrl: null,
    reportUrl: null,
    presentationUrl: null,
    commitSha: null,
    submittedAt: isoNow(),
    isCurrent: true,
  };

  for (const item of history) {
    item.isCurrent = false;
  }
  history.unshift(created);

  return created;
}
