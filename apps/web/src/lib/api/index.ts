import type { HealthResponse } from 'api-contracts';
import { env } from '../../config/env';
import { createRealTransport } from './transports/real';
import { createMockTransport } from './transports/mock';
import type { ApiRequestConfig, ApiTransport } from './transport';

/**
 * Typed API client — the single place where the frontend talks to the backend.
 *
 * Adding a new endpoint means adding a typed method here (with its contract
 * from `libs/api-contracts`), not a new `fetch` in a component.
 */
export interface ApiClient {
  /** Raw typed request, for endpoints without a dedicated method yet. */
  request: <TResponse>(path: string, config?: ApiRequestConfig) => Promise<TResponse>;

  /** `GET /health` — application + database status. */
  getHealth: () => Promise<HealthResponse>;
}

function createApiClient(transport: ApiTransport): ApiClient {
  return {
    request: (path, config) => transport.request(path, config),
    getHealth: () => transport.request<HealthResponse>('/health'),
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
