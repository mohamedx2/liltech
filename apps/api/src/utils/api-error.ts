import { z } from 'zod';

/**
 * Machine-readable API error codes.
 *
 * These are part of the public API contract (`libs/api-contracts`). The values
 * below mirror the error conventions from the LilTech specification; new codes
 * must be added to `libs/api-contracts` first and documented in `docs/api/`.
 */
export const ApiErrorCode = {
  INTERNAL: 'INTERNAL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  EVENT_NOT_LIVE: 'EVENT_NOT_LIVE',
  CTF_NOT_SOLVED: 'CTF_NOT_SOLVED',
  STAGE_LOCKED: 'STAGE_LOCKED',
  STAGE_NOT_PUBLISHED: 'STAGE_NOT_PUBLISHED',
  STAGE_NOT_CONFIGURED: 'STAGE_NOT_CONFIGURED',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Application-level error with a stable machine-readable code and HTTP status. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(ApiErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static unauthorized(message = 'Authentication required.'): ApiError {
    return new ApiError(ApiErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = 'You do not have access to this resource.'): ApiError {
    return new ApiError(ApiErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(message = 'Resource not found.'): ApiError {
    return new ApiError(ApiErrorCode.NOT_FOUND, message, 404);
  }

  static conflict(
    message = 'The request conflicts with the current state.',
    details?: unknown,
  ): ApiError {
    return new ApiError(ApiErrorCode.CONFLICT, message, 409, details);
  }

  static rateLimited(
    message = 'Too many requests. Please slow down.',
    details?: unknown,
  ): ApiError {
    return new ApiError(ApiErrorCode.RATE_LIMITED, message, 429, details);
  }

  static ctfNotSolved(): ApiError {
    return new ApiError(ApiErrorCode.CTF_NOT_SOLVED, 'Solve the Mini-CTF first.', 403);
  }
}

/** Shape helper used by the error handler so responses match the API contract. */
export function formatZodIssues(error: z.ZodError): unknown {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
