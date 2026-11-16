import { currentChallengeResponseSchema, type CurrentChallengeResponse } from 'api-contracts';
import { PLANNED_ENDPOINTS } from '../endpoints';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface ChallengesApi {
  /**
   * The running (or last ended) challenge for the signed-in team. The server
   * decides what is readable: before the event it answers `available: false`,
   * and a running challenge stays `locked` until `publicAt` unless the team
   * solved its Mini-CTF.
   */
  getCurrentChallenge: (
    config?: Pick<ApiRequestConfig, 'signal'>,
  ) => Promise<CurrentChallengeResponse>;
}

export function createChallengesApi(transport: ApiTransport): ChallengesApi {
  return {
    async getCurrentChallenge(config) {
      const data = await transport.request<unknown>(PLANNED_ENDPOINTS.CHALLENGES_CURRENT, {
        signal: config?.signal,
      });
      const parsed = currentChallengeResponseSchema.safeParse(data);
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
