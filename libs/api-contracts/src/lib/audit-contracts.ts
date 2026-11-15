import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for the audit log read endpoint:
 * - `GET /api/admin/audit-log` — admin only, offset-paginated, newest first.
 *
 * Sensitive administrative actions (phase transitions, badge revocation) are
 * recorded server-side with their target type and id.
 */

export const auditLogListRequestSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Only entries whose action starts with this prefix (e.g. `team.`, `checkin.`). */
  action: z
    .string()
    .trim()
    .regex(/^[a-z_.]+$/)
    .max(100)
    .optional(),
});

export type AuditLogListRequest = z.infer<typeof auditLogListRequestSchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actorName: z.string().nullable(),
  /** What the action touched (e.g. `team`, `participant`) and its id. */
  targetType: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  createdAt: isoTimestampSchema,
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
