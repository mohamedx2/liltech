import type { AdminJuryListResponse, AdminTeamListResponse, AuditLogEntry } from 'api-contracts';
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

/** Mock team roster derived from the dev mock portal team. */
export function handleGetAdminTeams(): AdminTeamListResponse {
  const team = devMockState.team;
  const leader = team.members.find((member) => member.roleInTeam === 'leader') ?? team.members[0];

  const items = [
    {
      id: team.id,
      name: team.name,
      progressState: team.progress,
      createdAt: devMockState.phaseChangedAt,
      leader: { id: leader.id, name: leader.fullName },
      participants: team.members.map((member) => ({
        id: member.id,
        name: member.fullName,
        isLeader: member.roleInTeam === 'leader',
        ...(member.isCheckedIn
          ? {
              checkedInAt:
                devMockState.badges.find((badge) => badge.participantId === member.id)
                  ?.checkedInAt ?? devMockState.phaseChangedAt,
            }
          : {}),
      })),
    },
  ];

  return { items, total: items.length };
}

/** Mock jury accounts derived from the dev mock users. */
export function handleGetAdminJury(): AdminJuryListResponse {
  const items = DEV_MOCK_JURY.map((jury) => ({ ...jury }));

  return { items, total: items.length };
}

const DEV_MOCK_JURY: AdminJuryListResponse['items'] = [
  {
    id: 'dev-mock-jury-1',
    name: 'Mock Jury Evaluator',
    email: 'jury@liltech.mock',
    createdAt: '2026-11-13T18:00:00.000Z',
  },
];
