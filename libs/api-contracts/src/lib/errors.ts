/**
 * API error contract.
 *
 * Every error response from the API uses this shape:
 *
 * ```json
 * {
 *   "error": {
 *     "code": "CTF_NOT_SOLVED",
 *     "message": "Solve the Mini-CTF first."
 *   }
 * }
 * ```
 *
 * The initial code list below follows the LilTech specification and standard
 * HTTP semantics. Codes are additive — clients must treat unknown codes as
 * generic errors.
 */
import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'INTERNAL',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'CTF_NOT_SOLVED',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/** Convenience factory used by the frontend mock adapter and tests. */
export function apiError(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
