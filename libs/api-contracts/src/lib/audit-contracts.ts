import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for the audit log read endpoint:
 * - `GET /api/admin/audit-log` — admin only, offset-paginated, newest first.
 *
 * Sensitive administrative actions (phase transitions, badge revocation) are
 * recorded server-side, with a short non-sensitive `summary` where useful.
 */

export const auditLogListRequestSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogListRequest = z.infer<typeof auditLogListRequestSchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actorName: z.string().nullable(),
  /** Short context such as `registration -> checkin (override)`. */
  summary: z.string().nullable().optional(),
  createdAt: isoTimestampSchema,
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
