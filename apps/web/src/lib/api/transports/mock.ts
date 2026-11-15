import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';
import { createAuthMockRoutes } from './mocks/auth.mock';
import { createEventsMockRoutes } from './mocks/events.mock';
import { createHealthMockRoutes } from './mocks/health.mock';
import { createRegistrationsMockRoutes } from './mocks/registrations.mock';
import { handleGetAnnouncements } from './mocks/announcements.mock';
import { handleGetCurrentChallenge } from './mocks/challenges.mock';
import { handleGetMiniCtfStatus, handleSubmitMiniCtfFlag } from './mocks/mini-ctf.mock';
import { handleGetCtfStage, handleRevealCtfHint, handleSubmitCtfAnswer } from './mocks/ctf.mock';
import { handleGetMyBadge, handleGetMyTeam } from './mocks/participants.mock';
import { handleCreateSubmission, handleGetMySubmissions } from './mocks/submissions.mock';
import type { MockRouteMap } from './mocks/types';
import { PLANNED_ENDPOINTS } from '../endpoints';
import type { MiniCtfSubmitRequest } from '../contracts/pending';
import type { CtfSubmitRequest as CtfSubmitAnswerRequest } from 'api-contracts';

export interface MockTransportOptions {
  /** Simulated network latency in milliseconds. */
  latencyMs?: number;
}

/**
 * In-memory mock transport. Lets UI work proceed without a running backend.
 *
 * Mocks never encode business rules that the backend owns — they exist so the
 * UI can be developed and tested before the API ships, and must never be used
 * as the source of truth for business logic — the API is.
 */
export function createMockTransport(options: MockTransportOptions = {}): ApiTransport {
  const latencyMs = options.latencyMs ?? 150;

  const routes: MockRouteMap = {
    ...createHealthMockRoutes(),
    ...createEventsMockRoutes(),
    ...createAuthMockRoutes(),
    ...createRegistrationsMockRoutes(),

    [`GET ${PLANNED_ENDPOINTS.PARTICIPANTS_TEAM}`]: () => handleGetMyTeam(),
    [`GET ${PLANNED_ENDPOINTS.PARTICIPANTS_BADGE}`]: () => handleGetMyBadge(),

    [`GET ${PLANNED_ENDPOINTS.MINI_CTF_STATUS}`]: () => handleGetMiniCtfStatus(),
    [`POST ${PLANNED_ENDPOINTS.MINI_CTF_SUBMIT}`]: (config) =>
      handleSubmitMiniCtfFlag((config.body ?? {}) as MiniCtfSubmitRequest),

    [`GET ${PLANNED_ENDPOINTS.CTF_STAGE}`]: () => handleGetCtfStage(),
    [`POST ${PLANNED_ENDPOINTS.CTF_HINT}`]: () => handleRevealCtfHint(),
    [`POST ${PLANNED_ENDPOINTS.CTF_SUBMIT}`]: (config) =>
      handleSubmitCtfAnswer((config.body ?? {}) as CtfSubmitAnswerRequest),

    [`GET ${PLANNED_ENDPOINTS.CHALLENGES_CURRENT}`]: () => handleGetCurrentChallenge(),

    [`GET ${PLANNED_ENDPOINTS.SUBMISSIONS_MY_TEAM}`]: () => handleGetMySubmissions(),
    [`POST ${PLANNED_ENDPOINTS.SUBMISSIONS}`]: (config) => handleCreateSubmission(config.body),

    [`GET ${PLANNED_ENDPOINTS.ANNOUNCEMENTS}`]: () => handleGetAnnouncements(),
  };

  return {
    async request<TResponse>(path: string, config: ApiRequestConfig = {}): Promise<TResponse> {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      if (config.signal?.aborted) {
        throw new ApiClientError({
          message: 'Request aborted.',
          status: null,
          code: 'ABORTED',
        });
      }

      const method = config.method ?? 'GET';
      const handler = routes[`${method} ${path}`];
      if (!handler) {
        throw new ApiClientError({
          message: `No mock defined for ${method} ${path}.`,
          status: 404,
          code: 'NOT_FOUND',
        });
      }

      return handler(config) as TResponse;
    },
  };
}
