import type { ApiErrorBody } from 'api-contracts';
import { apiClientErrorFromBody, ApiClientError } from '../errors';
import type { ApiRequestConfig, ApiTransport } from '../transport';

export interface RealTransportOptions {
  /** API base URL, e.g. `http://localhost:4000/api`. Never hardcode this — use `config/env.ts`. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Joins `baseUrl` (which may include a base path like `/api`) and `path`
 * without dropping the base path when `path` begins with `/`.
 */
export function buildRequestUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  return normalizedPath.length > 0 ? `${normalizedBase}/${normalizedPath}` : normalizedBase;
}

/**
 * Real HTTP transport against the Express API.
 * Normalizes every failure mode (network, timeout, non-JSON, API error body)
 * into `ApiClientError`.
 */
export function createRealTransport(options: RealTransportOptions): ApiTransport {
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async request<TResponse>(path: string, config: ApiRequestConfig = {}): Promise<TResponse> {
      const { method = 'GET', body, headers, authToken, credentials = 'include', signal } = config;
      const url = buildRequestUrl(options.baseUrl, path);

      const response = await doFetch(url, {
        method,
        credentials,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal,
      }).catch(
        (cause: unknown) =>
          new ApiClientError({
            message: 'Could not reach the server. Check your connection.',
            status: null,
            code: 'NETWORK_ERROR',
            details: cause,
          }),
      );

      if (response instanceof ApiClientError) throw response;

      let parsedBody: unknown = null;
      if (response.status !== 204) {
        const text = await response.text();
        if (text.length > 0) {
          try {
            parsedBody = JSON.parse(text);
          } catch {
            throw new ApiClientError({
              message: 'The server returned an unexpected response.',
              status: response.status,
              code: 'INVALID_RESPONSE',
            });
          }
        }
      }

      if (!response.ok) {
        const errorBody = parsedBody as ApiErrorBody | null;
        if (errorBody?.error?.code && errorBody?.error?.message) {
          throw apiClientErrorFromBody(response.status, errorBody);
        }
        throw new ApiClientError({
          message: `Request failed with status ${response.status}.`,
          status: response.status,
          code: 'UNKNOWN_ERROR',
        });
      }

      return parsedBody as TResponse;
    },
  };
}
