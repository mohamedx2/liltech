import { z } from 'zod';
import { adminTeamSchema } from './admin-operations-contracts.js';
import { adminJuryAccountDetailSchema } from './jury-admin-contracts.js';

/**
 * Contract for admin operational listing endpoints (read-only):
 * - `GET /api/admin/teams` — full team roster with contact, badge, check-in and
 *   Mini-CTF state (team shape: `admin-operations-contracts`)
 * - `GET /api/admin/jury`  — jury accounts with their admin-readable password
 *   (management endpoints: `jury-admin-contracts`)
 *
 * Results administration is intentionally absent — it is blocked on
 * `docs/decisions/OPEN_QUESTIONS.md` questions 3–5 and must not be invented.
 */

export const adminTeamListResponseSchema = z.object({
  items: z.array(adminTeamSchema),
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
