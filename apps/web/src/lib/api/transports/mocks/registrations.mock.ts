import { Role, TeamProgressState, createTeamRequestSchema } from 'api-contracts';
import { type TeamRegistrationResponse } from '../../contracts/pending';
import { PLANNED_ENDPOINTS } from '../../endpoints';
import { ApiClientError } from '../../errors';
import { devMockState } from './dev-state';
import type { MockRouteMap } from './types';

export function createRegistrationsMockRoutes(): MockRouteMap {
  return {
    [`POST ${PLANNED_ENDPOINTS.REGISTRATIONS}`]: (config): TeamRegistrationResponse => {
      // Validate the canonical wire contract, exactly like the real backend does.
      const parsed = createTeamRequestSchema.safeParse(config.body);
      if (!parsed.success) {
        throw new ApiClientError({
          message: parsed.error.issues[0]?.message ?? 'Please review the registration fields.',
          status: 400,
          code: 'VALIDATION_ERROR',
          details: parsed.error.issues,
        });
      }

      const leaderEmail = parsed.data.leader.email.toLowerCase();
      const allEmails = [
        leaderEmail,
        ...parsed.data.members.map((m) => m.email?.toLowerCase() ?? ''),
      ];
      if (new Set(allEmails).size !== allEmails.length) {
        throw new ApiClientError({
          message: 'Each team participant must use a unique email address.',
          status: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const teamId = `dev-team-${devMockState.registeredTeamEmails.size + 10}`;
      devMockState.registeredTeamEmails.set(leaderEmail, {
        id: `dev-user-${teamId}`,
        name: parsed.data.leader.name,
        email: leaderEmail,
        role: Role.Team,
        teamId,
        teamName: parsed.data.teamName,
        assignedTrack: null,
      });

      return {
        teamId,
        teamName: parsed.data.teamName,
        status: TeamProgressState.Registered,
        participantCount: 1 + parsed.data.members.length,
        createdAt: new Date().toISOString(),
        message:
          'Development mock registration accepted. No email or QR code is sent in mock mode.',
      };
    },
  };
}
