import type { HealthResponse } from 'api-contracts';
import { env } from '../../config/env';
import { getAuthToken } from './auth-token';
import { createAnnouncementsApi, type AnnouncementsApi } from './modules/announcements';
import { createAuthApi, type AuthApi } from './modules/auth';
import { createChallengesApi, type ChallengesApi } from './modules/challenges';
import { createCtfApi, type CtfApi } from './modules/ctf';
import { createEventsApi, type EventsApi } from './modules/events';
import { createHealthApi } from './modules/health';
import { createMiniCtfApi, type MiniCtfApi } from './modules/mini-ctf';
import { createParticipantsApi, type ParticipantsApi } from './modules/participants';
import { createRegistrationsApi, type RegistrationsApi } from './modules/registrations';
import { createSubmissionsApi, type SubmissionsApi } from './modules/submissions';
import type { ApiRequestConfig, ApiTransport } from './transport';
import { createMockTransport } from './transports/mock';
import { createRealTransport } from './transports/real';

/**
 * Typed API client — the single place where the frontend talks to the backend.
 *
 * Adding a new endpoint means adding a typed method in `lib/api/modules/`
 * (backed by a contract from `libs/api-contracts`), not a new `fetch` in a component.
 */
export interface ApiClient {
  /** Raw typed request, for endpoints without a dedicated module method yet. */
  request: <TResponse>(path: string, config?: ApiRequestConfig) => Promise<TResponse>;

  /** `GET /health` — application + database status. */
  getHealth: (config?: Pick<ApiRequestConfig, 'signal'>) => Promise<HealthResponse>;

  events: EventsApi;
  auth: AuthApi;
  registrations: RegistrationsApi;
  participants: ParticipantsApi;
  miniCtf: MiniCtfApi;
  ctf: CtfApi;
  challenges: ChallengesApi;
  submissions: SubmissionsApi;
  announcements: AnnouncementsApi;
}

/**
 * Attaches the stored session token to every request that does not set its own.
 * Centralising it here keeps components and modules free of token plumbing.
 */
function withSessionToken(transport: ApiTransport): ApiTransport {
  return {
    request: <TResponse>(path: string, config: ApiRequestConfig = {}) => {
      const token = config.authToken ?? getAuthToken();

      return transport.request<TResponse>(path, token ? { ...config, authToken: token } : config);
    },
  };
}

export function createApiClient(baseTransport: ApiTransport): ApiClient {
  const transport = withSessionToken(baseTransport);
  const health = createHealthApi(transport);

  return {
    request: (path, config) => transport.request(path, config),
    getHealth: (config) => health.getHealth(config),
    events: createEventsApi(transport),
    auth: createAuthApi(transport),
    registrations: createRegistrationsApi(transport),
    participants: createParticipantsApi(transport),
    miniCtf: createMiniCtfApi(transport),
    ctf: createCtfApi(transport),
    challenges: createChallengesApi(transport),
    submissions: createSubmissionsApi(transport),
    announcements: createAnnouncementsApi(transport),
  };
}

/**
 * Configured singleton client. Switching between mock and real backends is a
 * configuration concern (`NEXT_PUBLIC_API_MODE`) and requires no component
 * changes.
 */
export const api: ApiClient = createApiClient(
  env.NEXT_PUBLIC_API_MODE === 'mock'
    ? createMockTransport()
    : createRealTransport({ baseUrl: env.NEXT_PUBLIC_API_URL }),
);

export { ApiClientError } from './errors';
export type { ApiRequestConfig, ApiRequestMethod, ApiTransport } from './transport';
export type { RealTransportOptions } from './transports/real';
export type { MockTransportOptions } from './transports/mock';
export { IMPLEMENTED_ENDPOINTS, PLANNED_ENDPOINTS } from './endpoints';
