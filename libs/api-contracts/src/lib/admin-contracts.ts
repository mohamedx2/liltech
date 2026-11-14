import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { teamResponseSchema } from './registration-contracts.js';

/**
 * Contract for admin operational listing endpoints (read-only):
 * - `GET /api/admin/teams` — full team roster with participant check-in state
 * - `GET /api/admin/jury`  — jury accounts (no credentials, no scoring data)
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

export const adminJuryAccountSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  createdAt: isoTimestampSchema,
});

export type AdminJuryAccount = z.infer<typeof adminJuryAccountSchema>;

export const adminJuryListResponseSchema = z.object({
  items: z.array(adminJuryAccountSchema),
  total: z.number().int().nonnegative(),
});

export type AdminJuryListResponse = z.infer<typeof adminJuryListResponseSchema>;
