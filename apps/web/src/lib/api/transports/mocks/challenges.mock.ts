import { EventPhase, type CurrentChallengeResponse } from 'api-contracts';
import { devMockState } from './dev-state';

/** Mock of `GET /challenges/current`: early access once the mock Mini-CTF is solved. */
export function handleGetCurrentChallenge(): CurrentChallengeResponse {
  const mock = devMockState.challenge;
  const solved = devMockState.ctf.isSolved;

  return {
    available: true,
    phase: EventPhase.Live,
    serverTime: new Date().toISOString(),
    current: {
      challenge: {
        id: '7d1c2f3e-0000-4000-8000-0000000000c1',
        position: 1,
        title: mock.title,
        summary: mock.description.slice(0, 120),
        status: 'live',
        startedAt: '2026-11-21T19:00:00.000Z',
        endedAt: null,
        publicAt: '2026-11-21T20:00:00.000Z',
        publicDelayMinutes: 60,
        submissionDeadline: null,
      },
      access: solved ? 'early' : 'locked',
      ctfSolved: solved,
      unlocksAt: solved ? null : '2026-11-21T20:00:00.000Z',
      forcedOpen: false,
      submissionOpen: solved,
      content: solved
        ? {
            description: mock.description,
            problemStatement: mock.problemStatement,
            deliverables: mock.deliverablesRequirements,
            resources: mock.resources.map(({ name, url }) => ({ name, url })),
          }
        : null,
    },
  };
}
