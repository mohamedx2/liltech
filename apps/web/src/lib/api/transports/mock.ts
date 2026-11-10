import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';
import { createAuthMockRoutes } from './mocks/auth.mock';
import { createEventsMockRoutes } from './mocks/events.mock';
import { createHealthMockRoutes } from './mocks/health.mock';
import { createRegistrationsMockRoutes } from './mocks/registrations.mock';
import type { MockRouteMap } from './mocks/types';

export interface MockTransportOptions {
  /** Simulated network latency in milliseconds. */
  latencyMs?: number;
}

/**
 * In-memory mock transport. Lets UI work proceed without a running backend.
 *
 * Important: mock data must contain no real secrets, no CTF flags, and must
 * never be used as the source of truth for business logic — the API is.
 */
export function createMockTransport(options: MockTransportOptions = {}): ApiTransport {
  const latencyMs = options.latencyMs ?? 150;

  const routes: MockRouteMap = {
    ...createHealthMockRoutes(),
    ...createEventsMockRoutes(),
    ...createAuthMockRoutes(),
    ...createRegistrationsMockRoutes(),
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
