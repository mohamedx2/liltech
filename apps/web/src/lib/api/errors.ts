import type { ApiErrorBody } from 'api-contracts';

/** Error thrown by the API client for any failed request, including network errors. */
export class ApiClientError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details?: unknown;

  constructor(options: {
    message: string;
    status: number | null;
    code: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }

  /** True when the request never reached a server (offline, DNS, CORS, timeout). */
  get isNetworkError(): boolean {
    return this.status === null;
  }
}

function apiClientErrorFromBody(status: number, body: ApiErrorBody): ApiClientError {
  return new ApiClientError({
    message: body.error.message,
    status,
    code: body.error.code,
    details: body.error.details,
  });
}

export { apiClientErrorFromBody };
