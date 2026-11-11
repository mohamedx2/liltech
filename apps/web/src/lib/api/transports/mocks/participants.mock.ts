import { devMockState } from './dev-state';
import type { TeamSummary, BadgePassResponse } from '../../contracts/pending';

export function handleGetMyTeam(): TeamSummary {
  return devMockState.team;
}

export function handleGetMyBadge(): BadgePassResponse {
  return devMockState.badge;
}
