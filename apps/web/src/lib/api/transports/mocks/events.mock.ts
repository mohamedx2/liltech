import { EventPhase } from 'api-contracts';
import type { EventStateResponse } from '../../contracts/pending';
import { PLANNED_ENDPOINTS } from '../../endpoints';
import { devMockState } from './dev-state';
import type { MockRouteMap } from './types';

const NEXT_PHASE_MAP: Record<EventPhase, EventPhase | null> = {
  [EventPhase.Registration]: EventPhase.Checkin,
  [EventPhase.Checkin]: EventPhase.Live,
  [EventPhase.Live]: EventPhase.SubmissionsClosed,
  [EventPhase.SubmissionsClosed]: EventPhase.Pitching,
  [EventPhase.Pitching]: EventPhase.Results,
  [EventPhase.Results]: null,
};

export function createEventsMockRoutes(): MockRouteMap {
  return {
    [`GET ${PLANNED_ENDPOINTS.EVENT_STATE}`]: (): EventStateResponse => ({
      phase: devMockState.phase,
      serverTime: new Date().toISOString(),
      nextPhase: NEXT_PHASE_MAP[devMockState.phase],
      // Event kickoff reference timestamp from the LilTech specification (Nov 21, 2026 19:00 UTC / 20:00 CET)
      nextPhaseAt: '2026-11-21T19:00:00.000Z',
      phaseLabel: 'Development Mock Phase',
    }),
  };
}
