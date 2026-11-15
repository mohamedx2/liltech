import { z } from 'zod';
import { teamResponseSchema } from './registration-contracts.js';
import { adminJuryAccountDetailSchema } from './jury-admin-contracts.js';

/**
 * Contract for admin operational listing endpoints (read-only):
 * - `GET /api/admin/teams` — full team roster with participant check-in state
 * - `GET /api/admin/jury`  — jury accounts with their admin-readable password
 *   (management endpoints: `jury-admin-contracts`)
 *
 * Challenge track and results administration are intentionally absent — they
 * are blocked on `docs/decisions/OPEN_QUESTIONS.md` questions 1 and 3–5 and
 * must not be invented.
 */

export const adminTeamListResponseSchema = z.object({
  items: z.array(teamResponseSchema),
  total: z.number().int().nonnegative(),
});

export type AdminTeamListResponse = z.infer<typeof adminTeamListResponseSchema>;

export const adminJuryAccountSchema = adminJuryAccountDetailSchema;

export type AdminJuryAccount = z.infer<typeof adminJuryAccountSchema>;

export const adminJuryListResponseSchema = z.object({
  items: z.array(adminJuryAccountSchema),
  total: z.number().int().nonnegative(),
});

export type AdminJuryListResponse = z.infer<typeof adminJuryListResponseSchema>;

/**
 * `POST /api/admin/teams/:teamId/reset-password` (admin only, audited).
 * Team passwords are stored only as bcrypt hashes, so the current password
 * can never be shown; the admin sets a new one (or lets the server generate
 * one) and hands it to the team. Every session of the team account ends.
 */
export const resetTeamPasswordRequestSchema = z.strictObject({
  /** Omit to let the server generate a strong password. */
  password: z.string().min(12).max(256).optional(),
});

export type ResetTeamPasswordRequest = z.infer<typeof resetTeamPasswordRequestSchema>;

export const teamIdParamsSchema = z.strictObject({
  teamId: z.uuid(),
});

export const resetTeamPasswordResponseSchema = z.strictObject({
  teamId: z.uuid(),
  teamName: z.string(),
  /** The team account login (the leader email). */
  email: z.string(),
  /** The new password, returned once to the administrator. */
  password: z.string(),
});

export type ResetTeamPasswordResponse = z.infer<typeof resetTeamPasswordResponseSchema>;
