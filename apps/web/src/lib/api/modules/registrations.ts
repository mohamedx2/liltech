import {
  teamRegistrationResponseSchema,
  type TeamRegistrationRequest,
  type TeamRegistrationResponse,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface RegistrationsApi {
  registerTeam: (
    payload: TeamRegistrationRequest,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<TeamRegistrationResponse>;
}

export function createRegistrationsApi(transport: ApiTransport): RegistrationsApi {
  return {
    async registerTeam(payload, config) {
      const body = {
        teamName: payload.teamName,
        leader: {
          name: payload.leader.fullName,
          email: payload.leader.email,
          password: payload.password,
        },
        members: payload.teammates.map((m) => ({
          name: m.fullName,
          email: m.email,
        })),
      };

      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.REGISTRATIONS, {
        method: 'POST',
        body,
        signal: config?.signal,
      });
      const parsed = teamRegistrationResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Registration response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
