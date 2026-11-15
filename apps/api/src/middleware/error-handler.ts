import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../utils/logger';
import { ApiError, formatZodIssues } from '../utils/api-error';
import { z } from 'zod';

/**
 * Centralized error handling — the last middleware in the chain.
 * All errors are normalized to the API error contract:
 *   { "error": { "code": string, "message": string, "details"?: unknown } }
 */

function bodyParserErrorType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const { type } = error as { type: unknown };
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

export function errorHandler(log: Logger) {
  // Express 5 detects async rejections, so this signature is enough.
  return (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload is invalid.',
          details: formatZodIssues(error),
        },
      });
      return;
    }

    // Body-parser failures (malformed JSON, oversized body) are client errors.
    const bodyErrorType = bodyParserErrorType(error);

    if (bodyErrorType === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'The request body is not valid JSON.' },
      });
      return;
    }

    if (bodyErrorType === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'VALIDATION_ERROR', message: 'The request body is too large.' },
      });
      return;
    }

    // Unexpected errors are logged in full but never leak internals to clients.
    log.error({ err: error, requestId: req.id }, 'unhandled error');

    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'An unexpected error occurred.',
      },
    });
  };
}
