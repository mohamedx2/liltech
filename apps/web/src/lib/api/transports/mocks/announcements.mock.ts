import { devMockState } from './dev-state';
import type { AnnouncementsResponse } from '../../contracts/pending';

export function handleGetAnnouncements(): AnnouncementsResponse {
  return {
    items: devMockState.announcements,
    total: devMockState.announcements.length,
  };
}
