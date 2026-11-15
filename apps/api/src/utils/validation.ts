import type { Request } from 'express';
import type { z } from 'zod';
import { ApiError } from './api-error';

/**
 * Parses untrusted input (body, params, query) with a contract schema.
 * Failures become a 400 `VALIDATION_ERROR` carrying field-level details.
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw ApiError.badRequest(
      'The request payload is invalid.',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return result.data;
}

/** The authenticated account id; `requireAuth` must run first. */
export function authenticatedUserId(req: Request): string {
  const id = req.user?.id;

  if (!id) {
    throw ApiError.unauthorized();
  }

  return id;
}
