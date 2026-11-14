import {
  ChallengeTrack,
  EventPhase,
  Role,
  TeamProgressState,
  type AuditLogEntry,
  type BadgeSummary,
} from 'api-contracts';
import type {
  AnnouncementItem,
  AuthUser,
  BadgePassResponse,
  ChallengeDetailResponse,
  JuryTeamItem,
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
  /** Mock stand-in for the server-owned phase entry timestamp. */
  phaseChangedAt: string;
  registeredTeamEmails: Map<string, AuthUser>;

  /** Participant portal mock domain (provisional contracts, see `pending.ts`). */
  team: TeamSummary;
  badge: BadgePassResponse;
  ctf: Omit<MiniCtfStatusResponse, 'isOpen'> & { mockAcceptableFlag: string };
  challenge: ChallengeDetailResponse;
  submissions: SubmissionItem[];
  announcements: AnnouncementItem[];
  rateLimitAttempts: number;
  juryTeams: JuryTeamItem[];
  juryEvaluations: Map<
    string,
    {
      criteriaScores: Record<string, number>;
      notes: string;
      totalScore: number;
      evaluatedAt: string;
    }
  >;
  auditLog: AuditLogEntry[];
  badges: BadgeSummary[];
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
    juryTeams: [
      {
        id: 'dev-team-01',
        name: 'Sample Builders (Dev Mock)',
        track: ChallengeTrack.TrackA,
        progress: TeamProgressState.Submitted,
        membersCount: 3,
        submitted: true,
        submittedAt: '2026-11-21T21:15:00.000Z',
        submissionTitle: 'Initial Architecture Draft & Prototype',
        submissionRepoUrl: 'https://github.com/sample-builders/liltech-dispatcher',
        submissionFileName: 'prototype-v1.zip',
        evaluationStatus: 'pending' as const,
        myScore: null,
        evaluatedAt: null,
      },
      {
        id: 'dev-team-02',
        name: 'Quantum Coders',
        track: ChallengeTrack.TrackA,
        progress: TeamProgressState.Submitted,
        membersCount: 4,
        submitted: true,
        submittedAt: '2026-11-21T22:45:00.000Z',
        submissionTitle: 'Neural Fleet Optimization Dispatcher',
        submissionRepoUrl: 'https://github.com/quantum-coders/fleet-ai',
        submissionFileName: 'quantum-dispatcher-v2.tar.gz',
        evaluationStatus: 'graded' as const,
        myScore: 88,
        evaluatedAt: '2026-11-22T09:30:00.000Z',
      },
      {
        id: 'dev-team-03',
        name: 'Algorithmic Titans',
        track: ChallengeTrack.TrackA,
        progress: TeamProgressState.Submitted,
        membersCount: 4,
        submitted: true,
        submittedAt: '2026-11-22T04:10:00.000Z',
        submissionTitle: 'Dynamic Urban Route Clustering',
        submissionRepoUrl: 'https://github.com/algo-titans/route-clustering',
        submissionFileName: 'algo-titans-solution.zip',
        evaluationStatus: 'pending' as const,
        myScore: null,
        evaluatedAt: null,
      },
      {
        id: 'dev-team-04',
        name: 'DeepRoute Innovators',
        track: ChallengeTrack.TrackA,
        progress: TeamProgressState.ChallengeUnlocked,
        membersCount: 3,
        submitted: false,
        submittedAt: null,
        submissionTitle: null,
        submissionRepoUrl: null,
        submissionFileName: null,
        evaluationStatus: 'pending' as const,
        myScore: null,
        evaluatedAt: null,
      },
      {
        id: 'dev-team-05',
        name: 'CloudNexus Systems',
        track: ChallengeTrack.TrackB,
        progress: TeamProgressState.Submitted,
        membersCount: 5,
        submitted: true,
        submittedAt: '2026-11-22T03:00:00.000Z',
        submissionTitle: 'Serverless IoT Mesh Controller',
        submissionRepoUrl: 'https://github.com/cloudnexus/iot-controller',
        submissionFileName: 'cloudnexus-iot.zip',
        evaluationStatus: 'pending' as const,
        myScore: null,
        evaluatedAt: null,
      },
    ],
    juryEvaluations: new Map([
      [
        'dev-team-02',
        {
          criteriaScores: {
            technical_execution: 22,
            innovation_originality: 23,
            ui_ux_design: 21,
            pitch_presentation: 22,
          },
          notes:
            'Very impressive neural network approach to traffic rerouting. Presentation was clear and defended architectural trade-offs well.',
          totalScore: 88,
          evaluatedAt: '2026-11-22T09:30:00.000Z',
        },
      ],
    ]),
    auditLog: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        action: 'event.phase_changed',
        actorName: 'Mock Organizer Admin',
        createdAt: '2026-11-21T18:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        action: 'registration.team_created',
        actorName: null,
        createdAt: '2026-11-21T18:15:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        action: 'checkin.scan',
        actorName: 'Mock Organizer Admin',
        createdAt: '2026-11-21T18:30:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        action: 'announcement.published',
        actorName: 'Mock Organizer Admin',
        createdAt: '2026-11-21T19:30:00.000Z',
      },
    ],
    badges: [
      {
        participantId: '00000000-0000-4000-8000-000000000001',
        participantName: 'Mock Team Leader',
        teamName: 'Sample Builders (Dev Mock)',
        issuedAt: '2026-11-20T10:00:00.000Z',
        checkedInAt: '2026-11-21T18:30:00.000Z',
      },
      {
        participantId: '00000000-0000-4000-8000-000000000002',
        participantName: 'Mock Teammate One',
        teamName: 'Sample Builders (Dev Mock)',
        issuedAt: '2026-11-20T10:00:00.000Z',
        checkedInAt: '2026-11-21T18:45:00.000Z',
      },
      {
        participantId: '00000000-0000-4000-8000-000000000003',
        participantName: 'Mock Teammate Two',
        teamName: 'Sample Builders (Dev Mock)',
        issuedAt: '2026-11-20T10:00:00.000Z',
        checkedInAt: undefined,
      },
      {
        participantId: '00000000-0000-4000-8000-000000000004',
        participantName: 'Kais Ben Ali',
        teamName: 'Quantum Coders',
        issuedAt: '2026-11-20T11:00:00.000Z',
        checkedInAt: '2026-11-21T19:00:00.000Z',
      },
      {
        participantId: '00000000-0000-4000-8000-000000000005',
        participantName: 'Nour Trabelsi',
        teamName: 'Quantum Coders',
        issuedAt: '2026-11-20T11:00:00.000Z',
        checkedInAt: undefined,
      },
      {
        participantId: '00000000-0000-4000-8000-000000000006',
        participantName: 'Yassine Gharbi',
        teamName: 'Algorithmic Titans',
        issuedAt: '2026-11-20T12:00:00.000Z',
        checkedInAt: undefined,
      },
    ],
  } satisfies Pick<
    DevMockState,
    | 'team'
    | 'badge'
    | 'ctf'
    | 'challenge'
    | 'submissions'
    | 'announcements'
    | 'rateLimitAttempts'
    | 'juryTeams'
    | 'juryEvaluations'
    | 'auditLog'
    | 'badges'
  >;
}

const initialState = (): DevMockState => ({
  currentUser: null,
  phase: EventPhase.Registration,
  // Event kickoff reference timestamp from the LilTech specification (Nov 21, 2026 19:00 UTC / 20:00 CET)
  phaseChangedAt: '2026-11-21T19:00:00.000Z',
  registeredTeamEmails: new Map(),
  ...createPortalState(),
});

export const devMockState: DevMockState = initialState();

export function resetDevMockState(): void {
  devMockState.currentUser = null;
  devMockState.phase = EventPhase.Registration;
  devMockState.phaseChangedAt = '2026-11-21T19:00:00.000Z';
  devMockState.registeredTeamEmails.clear();
  Object.assign(devMockState, createPortalState());
}

export { SUBMISSION_DEADLINE };
