import { ChallengeTrack, EventPhase, Role } from 'api-contracts';
import type { AuthUser } from '../../contracts/pending';

/**
 * DEV-ONLY in-memory state for `NEXT_PUBLIC_API_MODE=mock`.
 * Never imported by `RealTransport` or production API logic.
 * Contains zero real credentials, secrets, or CTF flags.
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
}

const initialState = (): DevMockState => ({
  currentUser: null,
  phase: EventPhase.Registration,
  registeredTeamEmails: new Map(),
});

export const devMockState: DevMockState = initialState();

export function resetDevMockState(): void {
  devMockState.currentUser = null;
  devMockState.phase = EventPhase.Registration;
  devMockState.registeredTeamEmails.clear();
}
