import { ChallengeTrack, EventPhase, Role, TeamProgressState } from 'api-contracts';
import type {
  AnnouncementItem,
  AuthUser,
  BadgePassResponse,
  ChallengeDetailResponse,
  MiniCtfStatusResponse,
  SubmissionItem,
  TeamSummary,
} from '../../contracts/pending';

/**
 * DEV-ONLY in-memory state for `NEXT_PUBLIC_API_MODE=mock`.
 * Never imported by `RealTransport` or production API logic.
 * Contains zero real credentials, secrets, or CTF flags — the flag value below
 * is an obviously fake placeholder for exercising the flag-submission flow.
 */

export const DEV_MOCK_USERS: readonly AuthUser[] = [
  {
    id: 'dev-mock-team-1',
    name: 'Mock Team Leader',
    email: 'team@liltech.mock',
    role: Role.Team,
    teamId: 'dev-team-01',
    teamName: 'Sample Builders (Dev Mock)',
    assignedTrack: null,
  },
  {
    id: 'dev-mock-jury-1',
    name: 'Mock Jury Evaluator',
    email: 'jury@liltech.mock',
    role: Role.Jury,
    teamId: null,
    teamName: null,
    assignedTrack: ChallengeTrack.TrackA,
  },
  {
    id: 'dev-mock-admin-1',
    name: 'Mock Organizer Admin',
    email: 'admin@liltech.mock',
    role: Role.Admin,
    teamId: null,
    teamName: null,
    assignedTrack: null,
  },
];

export interface DevMockState {
  currentUser: AuthUser | null;
  phase: EventPhase;
  registeredTeamEmails: Map<string, AuthUser>;

  /** Participant portal mock domain (provisional contracts, see `pending.ts`). */
  team: TeamSummary;
  badge: BadgePassResponse;
  ctf: Omit<MiniCtfStatusResponse, 'isOpen'> & { mockAcceptableFlag: string };
  challenge: ChallengeDetailResponse;
  submissions: SubmissionItem[];
  announcements: AnnouncementItem[];
  rateLimitAttempts: number;
}

/**
 * Submission deadline reference from the LilTech specification (Nov 22, 2026 08:00 UTC).
 */
const SUBMISSION_DEADLINE = '2026-11-22T08:00:00.000Z';

function createPortalState() {
  return {
    team: {
      id: 'dev-team-01',
      name: 'Sample Builders (Dev Mock)',
      track: ChallengeTrack.TrackA,
      progress: TeamProgressState.CheckedIn,
      isCheckedIn: true,
      members: [
        {
          id: 'usr-part-01',
          teamId: 'dev-team-01',
          fullName: 'Mock Team Leader',
          email: 'team@liltech.mock',
          phone: '+216 20 123 456',
          roleInTeam: 'leader' as const,
          isCheckedIn: true,
        },
        {
          id: 'usr-part-02',
          teamId: 'dev-team-01',
          fullName: 'Mock Teammate One',
          email: 'teammate1@liltech.mock',
          phone: '+216 20 234 567',
          roleInTeam: 'member' as const,
          isCheckedIn: true,
        },
        {
          id: 'usr-part-03',
          teamId: 'dev-team-01',
          fullName: 'Mock Teammate Two',
          email: 'teammate2@liltech.mock',
          phone: '+216 20 345 678',
          roleInTeam: 'member' as const,
          isCheckedIn: false,
        },
      ],
    },
    badge: {
      participantId: 'usr-part-01',
      participantName: 'Mock Team Leader',
      teamId: 'dev-team-01',
      teamName: 'Sample Builders (Dev Mock)',
      track: ChallengeTrack.TrackA,
      // Accessible SVG placeholder for the emailed QR badge
      qrData: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23ffffff"/><rect x="20" y="20" width="40" height="40"/><rect x="140" y="20" width="40" height="40"/><rect x="20" y="140" width="40" height="40"/><rect x="80" y="80" width="40" height="40"/><rect x="90" y="30" width="20" height="20"/><rect x="30" y="90" width="20" height="20"/><rect x="150" y="90" width="20" height="20"/><rect x="90" y="150" width="20" height="20"/></svg>`,
      qrToken: 'LILTECH-2026-DEV-MOCK-BADGE-TOKEN',
    },
    ctf: {
      isSolved: false,
      solvedAt: undefined,
      attemptsCount: 0,
      cooldownUntil: undefined,
      hint: 'Inspect the platform challenge hints or decipher the cipher in the CTF brief.',
      // Fake placeholder flag — never a real flag (AGENTS.md §7)
      mockAcceptableFlag: 'LILTECH{mock_flag_demo}',
    },
    challenge: {
      id: 'chal-track-a-01',
      track: ChallengeTrack.TrackA,
      title: 'Autonomous AI Logistics Dispatcher',
      description:
        'Design and build an intelligent real-time dispatching engine that optimizes multi-agent fleet routing under dynamic urban constraints.',
      problemStatement:
        'Emergency response teams and cargo couriers in urban hubs suffer from routing delays during peak hours. Your solution must consume real-time telemetry, model traffic congestion, and dispatch tasks to agents with minimal latency and maximal reliability.',
      deliverablesRequirements: [
        'Clean, documented Git repository containing runnable solution and setup instructions',
        'Architecture documentation explaining your dispatch heuristic and failure recovery modes',
        'Pitch slide deck (.pdf)',
        'Demonstration video or live deployment URL',
      ],
      resources: [
        { name: 'Urban Telemetry Dataset (GeoJSON/CSV)', url: '#', size: '2.4 MB' },
        { name: 'API Protocol Specification (.pdf)', url: '#', size: '420 KB' },
        { name: 'Benchmark Evaluation Script (.py)', url: '#', size: '18 KB' },
      ],
    },
    submissions: [
      {
        id: 'sub-001',
        teamId: 'dev-team-01',
        track: ChallengeTrack.TrackA,
        title: 'Initial Architecture Draft & Prototype',
        description: 'First version of the dispatch engine using simulated graph weights.',
        repoUrl: 'https://github.com/sample-builders/liltech-dispatcher',
        fileName: 'prototype-v1.zip',
        fileSizeBytes: 1048576,
        submittedAt: '2026-11-21T21:15:00.000Z',
        version: 1,
      },
    ],
    announcements: [
      {
        id: 'ann-001',
        title: 'LilTech 2026 is LIVE! Mini-CTF is Open',
        content:
          'Welcome hackers! The Mini-CTF is officially unlocked. Submit your valid flag to unlock your track workspace and main challenge brief.',
        priority: 'broadcast' as const,
        createdAt: '2026-11-21T19:30:00.000Z',
      },
      {
        id: 'ann-002',
        title: 'Mentors Available in Rooms 101 & 102',
        content:
          'Mentors for AI/ML and Cloud Infrastructure are available for 1-on-1 architecture consultations.',
        priority: 'normal' as const,
        createdAt: '2026-11-21T20:30:00.000Z',
      },
      {
        id: 'ann-003',
        title: 'Buffet Open in Campus Atrium',
        content: 'Late-night snacks, coffee, and energy drinks are served in the central atrium.',
        priority: 'urgent' as const,
        createdAt: '2026-11-21T21:00:00.000Z',
      },
    ],
    rateLimitAttempts: 0,
  } satisfies Pick<
    DevMockState,
    'team' | 'badge' | 'ctf' | 'challenge' | 'submissions' | 'announcements' | 'rateLimitAttempts'
  >;
}

const initialState = (): DevMockState => ({
  currentUser: null,
  phase: EventPhase.Registration,
  registeredTeamEmails: new Map(),
  ...createPortalState(),
});

export const devMockState: DevMockState = initialState();

export function resetDevMockState(): void {
  devMockState.currentUser = null;
  devMockState.phase = EventPhase.Registration;
  devMockState.registeredTeamEmails.clear();
  Object.assign(devMockState, createPortalState());
}

export { SUBMISSION_DEADLINE };
