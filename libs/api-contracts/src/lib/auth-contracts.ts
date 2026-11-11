import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { roleSchema } from './roles.js';

/**
 * Contract for the authentication module:
 * - `POST /api/auth/login`
 * - `POST /api/auth/logout`
 * - `GET  /api/auth/me`
 *
 * Authentication uses opaque, DB-backed session tokens sent as
 * `Authorization: Bearer <token>`. Tokens are stored hashed server-side and
 * expire after a server-configured lifetime. See `docs/api/README.md`.
 */

export const loginRequestSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Public account representation — never includes credentials. */
export const accountSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  name: z.string(),
  email: z.email(),
});

export type Account = z.infer<typeof accountSchema>;

export const loginResponseSchema = z.object({
  account: accountSchema,
  /** Opaque bearer token. Treat as a credential client-side. */
  token: z.string().min(32),
  /** ISO 8601 UTC instant after which the token is refused. Server-provided. */
  expiresAt: isoTimestampSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export type MeResponse = Account;
