import { devMockState } from './dev-state';
import type { TeamBadgesResponse, TeamSummary } from '../../contracts/pending';

export function handleGetMyTeam(): TeamSummary {
  return devMockState.team;
}

export function handleGetMyBadge(): TeamBadgesResponse {
  return devMockState.badge;
}
