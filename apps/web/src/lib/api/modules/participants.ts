import {
  resendBadgeEmailResponseSchema,
  teamBadgesResponseSchema,
  teamSummarySchema,
  type ResendBadgeEmailResponse,
  type TeamBadgesResponse,
  type TeamSummary,
} from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface ParticipantsApi {
  getMyTeam: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<TeamSummary>;
  /** Every member's QR badge for the signed-in team. */
  getMyBadges: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<TeamBadgesResponse>;
  /** Resends one member's badge email (the server allows one per hour). */
  resendBadgeEmail: (
    participantId: string,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<ResendBadgeEmailResponse>;
}

function invalidResponse(message: string, details: unknown): ApiClientError {
  return new ApiClientError({ message, status: null, code: 'INVALID_RESPONSE', details });
}

export function createParticipantsApi(transport: ApiTransport): ParticipantsApi {
  return {
    async getMyTeam(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.PARTICIPANTS_TEAM, {
        signal: config?.signal,
      });
      const parsed = teamSummarySchema.safeParse(data);
      if (!parsed.success) {
        throw invalidResponse(
          'Team summary response did not match the expected contract.',
          parsed.error.issues,
        );
      }
      return parsed.data;
    },

    async getMyBadges(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.PARTICIPANTS_BADGE, {
        signal: config?.signal,
      });
      const parsed = teamBadgesResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw invalidResponse(
          'Badge response did not match the expected contract.',
          parsed.error.issues,
        );
      }
      return parsed.data;
    },

    async resendBadgeEmail(participantId, config) {
      const data = await transport.request<unknown>(
        `${PLANNED_ENDPOINTS.PARTICIPANTS_BADGE}/${encodeURIComponent(participantId)}/resend-email`,
        { method: 'POST', signal: config?.signal },
      );
      const parsed = resendBadgeEmailResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw invalidResponse(
          'Resend response did not match the expected contract.',
          parsed.error.issues,
        );
      }
      return parsed.data;
    },
  };
}
