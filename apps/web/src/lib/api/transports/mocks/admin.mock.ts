import {
  BADGE_COLORS,
  TeamProgressState,
  type AdminChallengeListResponse,
  type AdminJuryListResponse,
  type AdminOverviewResponse,
  type AdminTeam,
  type AdminTeamListResponse,
  type AuditLogEntry,
  type SendBadgeEmailsResponse,
} from 'api-contracts';
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
  const id = crypto.randomUUID();
  const authorName = devMockState.currentUser?.name ?? 'Mock Organizer Admin';

  devMockState.announcements.unshift({
    id,
    title: 'Organizer Broadcast',
    content: body.trim(),
    priority: 'broadcast',
    createdAt: now,
  });

  devMockState.auditLog.unshift({
    id: crypto.randomUUID(),
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
  const items = [buildMockAdminTeam()];
  return { items, total: items.length };
}

/** `GET /admin/teams/:teamId` — only the dev mock team exists. */
export function handleGetAdminTeam(teamId: string): AdminTeam {
  const team = buildMockAdminTeam();
  if (team.id !== teamId) {
    throw new ApiClientError({ message: 'Team not found.', status: 404, code: 'NOT_FOUND' });
  }
  return team;
}

function buildMockAdminTeam(): AdminTeam {
  const team = devMockState.team;
  const leader = team.members.find((member) => member.roleInTeam === 'leader') ?? team.members[0];

  return {
    id: team.id,
    name: team.name,
    progressState: team.progress,
    status: 'active',
    statusReason: null,
    statusChangedAt: null,
    createdAt: devMockState.phaseChangedAt,
    leader: { id: MOCK_LEADER_ACCOUNT_ID, name: leader.fullName, email: leader.email ?? '' },
    participants: team.members.map((member) => ({
      id: member.id,
      name: member.fullName,
      isLeader: member.roleInTeam === 'leader',
      email: member.email,
      university: 'Mock University',
      phone: '+216 20 000 000',
      color: member.color,
      checkedInAt: member.isCheckedIn ? devMockState.phaseChangedAt : null,
      checkedInByName: member.isCheckedIn ? 'Mock Organizer Admin' : null,
      badge: {
        issuedAt: devMockState.phaseChangedAt,
        revokedAt: null,
        emailStatus: 'sent',
        emailLastSentAt: devMockState.phaseChangedAt,
      },
    })),
    ctfSolves: [],
  };
}

const MOCK_LEADER_ACCOUNT_ID = '7d1c2f3e-0000-4000-8000-0000000000f1';

/** Mock situation board derived from the mock roster. */
export function handleGetAdminOverview(): AdminOverviewResponse {
  const team = buildMockAdminTeam();
  const checkedIn = team.participants.filter((participant) => participant.checkedInAt).length;
  const byProgress = Object.fromEntries(
    Object.values(TeamProgressState).map((progress) => [progress, 0]),
  ) as AdminOverviewResponse['teams']['byProgress'];
  byProgress[team.progressState] = 1;

  return {
    serverTime: new Date().toISOString(),
    phase: devMockState.phase,
    phaseChangedAt: devMockState.phaseChangedAt,
    teams: {
      total: 1,
      active: 1,
      withdrawn: 0,
      disqualified: 0,
      byProgress,
      fullyCheckedIn: checkedIn === team.participants.length ? 1 : 0,
      partiallyCheckedIn: checkedIn > 0 && checkedIn < team.participants.length ? 1 : 0,
      notCheckedIn: checkedIn === 0 ? 1 : 0,
    },
    participants: {
      total: team.participants.length,
      checkedIn,
      byColor: BADGE_COLORS.map((color) => {
        const group = team.participants.filter((participant) => participant.color === color);
        return {
          color,
          total: group.length,
          checkedIn: group.filter((participant) => participant.checkedInAt).length,
        };
      }),
    },
    badges: {
      revoked: 0,
      emailSent: team.participants.length,
      emailPending: 0,
      emailFailed: 0,
      missingEmail: 0,
    },
    challenges: [],
    juryAccounts: DEV_MOCK_JURY.length,
    announcements: { total: devMockState.announcements.length, lastPublishedAt: null },
  };
}

/** No challenges exist in mock mode; challenge management needs the real API. */
export function handleGetAdminChallenges(): AdminChallengeListResponse {
  return { items: [], total: 0 };
}

/** Mock bulk send: simulates success with the team member count. */
export function handleSendAllBadgeEmails(): SendBadgeEmailsResponse {
  const team = devMockState.team;
  const total = team.members.filter((m) => m.email).length;
  return { total, sent: total, failed: 0 };
}

/** Mock jury accounts derived from the dev mock users. */
export function handleGetAdminJury(): AdminJuryListResponse {
  const items = DEV_MOCK_JURY.map((jury) => ({ ...jury }));

  return { items, total: items.length };
}

const DEV_MOCK_JURY: AdminJuryListResponse['items'] = [
  {
    id: '7d1c2f3e-0000-4000-8000-0000000000e1',
    name: 'Mock Jury Evaluator',
    email: 'jury@liltech.mock',
    password: 'mock-jury-password',
    createdAt: '2026-11-13T18:00:00.000Z',
  },
];
