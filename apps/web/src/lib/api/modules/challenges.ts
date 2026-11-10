import { challengeDetailResponseSchema, type ChallengeDetailResponse } from '../contracts/pending';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface ChallengesApi {
  getCurrentChallenge: (
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<ChallengeDetailResponse>;
}

export function createChallengesApi(transport: ApiTransport): ChallengesApi {
  return {
    async getCurrentChallenge(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CHALLENGES_CURRENT, {
        signal: config?.signal,
      });
      const parsed = challengeDetailResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiClientError({
          message: 'Challenge response did not match the expected contract.',
          status: null,
          code: 'INVALID_RESPONSE',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
