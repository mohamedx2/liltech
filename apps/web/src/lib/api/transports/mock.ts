import type { HealthResponse } from 'api-contracts';
import { ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface MockTransportOptions {
  /** Simulated network latency in milliseconds. */
  latencyMs?: number;
}

type MockHandler = (config: ApiRequestConfig) => unknown;

/**
 * In-memory mock transport. Lets UI work proceed without a running backend.
 *
 * Important: mock data must contain no real secrets, no CTF flags, and must
 * never be used as the source of truth for business logic — the API is.
 */
export function createMockTransport(options: MockTransportOptions = {}): ApiTransport {
  const latencyMs = options.latencyMs ?? 300;

  const routes: Record<string, MockHandler> = {
    'GET /health': (): HealthResponse => ({
      status: 'ok',
      uptimeSeconds: 42,
      timestamp: new Date().toISOString(),
      database: { status: 'up', latencyMs: 2 },
    }),
  };

  return {
    async request<TResponse>(path: string, config: ApiRequestConfig = {}): Promise<TResponse> {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));

      const handler = routes[`${config.method ?? 'GET'} ${path}`];
      if (!handler) {
        throw new ApiClientError({
          message: `No mock defined for ${config.method ?? 'GET'} ${path}.`,
          status: 404,
          code: 'NOT_FOUND',
        });
      }
      return handler(config) as TResponse;
    },
  };
}
