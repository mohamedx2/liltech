/**
 * Transport-agnostic API request primitives.
 * Business components must never call `fetch` directly — they go through
 * `createApiClient` (`lib/api/index.ts`) which picks the real or mock adapter
 * based on configuration.
 */

export type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestConfig {
  method?: ApiRequestMethod;
  /** JSON-serializable request body. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Bearer token attached as `Authorization: Bearer <token>` when present. */
  authToken?: string;
  signal?: AbortSignal;
}

/**
 * A transport performs a request against some backend and returns the parsed
 * JSON response body, or throws `ApiClientError`.
 */
export interface ApiTransport {
  request<TResponse>(path: string, config?: ApiRequestConfig): Promise<TResponse>;
}
