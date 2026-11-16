import { z } from 'zod';
import {
  badgeSummarySchema,
  checkInResponseSchema,
  type BadgeSummary,
  type CheckInResponse,
} from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface CheckinApi {
  scanBadge: (token: string, config?: Pick<ApiRequestConfig, 'signal'>) => Promise<CheckInResponse>;
  revokeBadge: (
    participantId: string,
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<{ participantId: string; revokedAt: string }>;
  getBadges: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<BadgeSummary[]>;
}

export function createCheckinApi(transport: ApiTransport): CheckinApi {
  return {
    async scanBadge(token, config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CHECKIN_SCAN, {
        method: 'POST',
        body: { token },
        signal: config?.signal,
      });
      const parsed = checkInResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Scan response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },

    async revokeBadge(participantId, config) {
      const data = await transport.request<{ participantId: string; revokedAt: string }>(
        PLANNED_ENDPOINTS.CHECKIN_REVOKE,
        {
          method: 'POST',
          body: { participantId },
          signal: config?.signal,
        },
      );
      return data;
    },

    async getBadges(config) {
      // The endpoint wraps the roster: `{ items: BadgeSummary[], total }`.
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CHECKIN_BADGES, {
        signal: config?.signal,
      });
      const parsed = z
        .object({ items: z.array(badgeSummarySchema), total: z.number().int().nonnegative() })
        .safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Badge listing response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data.items;
    },
  };
}
