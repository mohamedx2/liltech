import type { AuditLogEntry } from 'api-contracts';
import { ApiClientError } from '../../errors';
import { devMockState } from './dev-state';

export function handleGetAuditLog(
  limit = 50,
  offset = 0,
): { items: AuditLogEntry[]; total: number } {
  const total = devMockState.auditLog.length;
  const items = devMockState.auditLog.slice(offset, offset + limit);
  return { items, total };
}

export function handlePublishAdminAnnouncement(body: string): {
  id: string;
  body: string;
  publishedAt: string;
  authorName: string;
} {
  if (!body || body.trim().length === 0) {
    throw new ApiClientError({
      message: 'Announcement body cannot be empty.',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const now = new Date().toISOString();
  const id = `ann-${Date.now()}`;
  const authorName = devMockState.currentUser?.name ?? 'Mock Organizer Admin';

  devMockState.announcements.unshift({
    id,
    title: 'Organizer Broadcast',
    content: body.trim(),
    priority: 'broadcast',
    createdAt: now,
  });

  devMockState.auditLog.unshift({
    id: `audit-${Date.now()}`,
    action: 'announcement.published',
    actorName: authorName,
    createdAt: now,
  });

  return {
    id,
    body: body.trim(),
    publishedAt: now,
    authorName,
  };
}
