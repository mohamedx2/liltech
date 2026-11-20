import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for admin jury account management (admin role only):
 * - `GET    /api/admin/jury`      — jury accounts, including their passwords
 * - `POST   /api/admin/jury`      — create a jury account
 * - `PATCH  /api/admin/jury/:id`  — update name, email, password and/or the
 *   assigned challenge (`challengeId`, `null` to unassign)
 * - `DELETE /api/admin/jury/:id`  — delete the account and end its sessions
 *
 * Jury passwords are deliberately readable by administrators so they can be
 * handed to jury members (organizer decision, see AGENTS.md §9). They are
 * never returned by any non-admin endpoint.
 */

const JURY_PASSWORD_MIN = 12;

export const juryPasswordSchema = z.string().min(JURY_PASSWORD_MIN).max(256);

export const createJuryAccountRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  /** Omit to let the server generate a strong password. */
  password: juryPasswordSchema.optional(),
  /** The challenge this juror evaluates; omit or `null` to assign it later. */
  challengeId: z.uuid().nullable().optional(),
});

export type CreateJuryAccountRequest = z.infer<typeof createJuryAccountRequestSchema>;

export const updateJuryAccountRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.email().optional(),
    password: juryPasswordSchema.optional(),
    /** `null` removes the assignment. */
    challengeId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update.',
  });

export type UpdateJuryAccountRequest = z.infer<typeof updateJuryAccountRequestSchema>;

export const juryIdParamsSchema = z.strictObject({
  id: z.uuid(),
});

export const adminJuryAccountDetailSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  /** `null` for accounts created before readable passwords were stored. */
  password: z.string().nullable(),
  /** The challenge this juror evaluates; `null` until assigned. */
  challengeId: z.uuid().nullable(),
  challengeTitle: z.string().nullable(),
  createdAt: isoTimestampSchema,
});

export type AdminJuryAccountDetail = z.infer<typeof adminJuryAccountDetailSchema>;
