import {
  badgePassResponseSchema,
  teamSummarySchema,
  type BadgePassResponse,
  type TeamSummary,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface ParticipantsApi {
  getMyTeam: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<TeamSummary>;
  getMyBadge: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<BadgePassResponse>;
}

export function createParticipantsApi(transport: ApiTransport): ParticipantsApi {
  return {
    async getMyTeam(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.PARTICIPANTS_TEAM, {
        signal: config?.signal,
      });
      const parsed = teamSummarySchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Team summary response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async getMyBadge(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.PARTICIPANTS_BADGE, {
        signal: config?.signal,
      });
      const parsed = badgePassResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Badge pass response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
