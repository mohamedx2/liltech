import type { EventStateResponse } from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../../endpoints';
import { devMockState } from './dev-state';
import type { MockRouteMap } from './types';

/**
 * Mock responses mirror the canonical `EventStateResponse` wire contract
 * (`libs/api-contracts`) exactly — phase + authoritative server time. Display
 * helpers like `nextPhase` are derived in `contracts/pending.ts`, never stored
 * in the mock payload.
 */
/** Dev mock: the Mini-CTF opened five minutes ago and closes in 55 minutes. */
const MOCK_CTF_STARTED_AT = new Date(Date.now() - 5 * 60_000).toISOString();
const MOCK_CTF_CLOSES_AT = new Date(Date.now() + 55 * 60_000).toISOString();

export function createEventsMockRoutes(): MockRouteMap {
  return {
    [`GET ${PLANNED_ENDPOINTS.EVENT_STATE}`]: (): EventStateResponse => ({
      phase: devMockState.phase,
      phaseChangedAt: devMockState.phaseChangedAt,
      serverTime: new Date().toISOString(),
      ctfStartedAt: MOCK_CTF_STARTED_AT,
      ctfClosesAt: MOCK_CTF_CLOSES_AT,
    }),

    [`POST ${PLANNED_ENDPOINTS.EVENT_STATE}`]: (config): EventStateResponse => {
      const body = (config.body ?? {}) as { phase?: EventStateResponse['phase'] };
      if (body.phase) {
        devMockState.phase = body.phase;
        devMockState.phaseChangedAt = new Date().toISOString();
        devMockState.auditLog.unshift({
          id: `audit-${Date.now()}`,
          action: 'event.phase_changed',
          actorName: devMockState.currentUser?.name ?? 'Mock Organizer Admin',
          createdAt: new Date().toISOString(),
        });
      }
      return {
        phase: devMockState.phase,
        phaseChangedAt: devMockState.phaseChangedAt,
        serverTime: new Date().toISOString(),
        ctfStartedAt: MOCK_CTF_STARTED_AT,
        ctfClosesAt: MOCK_CTF_CLOSES_AT,
      };
    },
  };
}
