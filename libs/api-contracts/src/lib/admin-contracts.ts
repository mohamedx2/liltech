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
