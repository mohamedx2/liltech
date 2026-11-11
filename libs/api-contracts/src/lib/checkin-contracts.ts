import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { participantNameSchema } from './registration-contracts.js';

/**
 * Contract for the check-in module:
 * - `POST /api/checkin/scan` — staff (admin) scans a participant QR badge token
 * - `POST /api/checkin/revoke` — staff revokes a badge token (it is a credential)
 *
 * QR token material is only ever sent at issuance (registration module) or via
 * the admin badge listing; it is stored hashed here and never echoed back for
 * validation.
 */

/** Raw QR token: 32 random bytes, base64url-encoded (43 characters). */
export const qrTokenSchema = z
  .string()
  .trim()
  .length(43)
  .regex(/^[A-Za-z0-9_-]+$/);

export const scanCheckInRequestSchema = z.strictObject({
  token: qrTokenSchema,
});

export type ScanCheckInRequest = z.infer<typeof scanCheckInRequestSchema>;

export const revokeBadgeRequestSchema = z.strictObject({
  participantId: z.string().uuid(),
});

export type RevokeBadgeRequest = z.infer<typeof revokeBadgeRequestSchema>;

export const checkInResponseSchema = z.strictObject({
  participant: z.strictObject({
    id: z.uuid(),
    name: participantNameSchema,
  }),
  team: z.strictObject({
    id: z.uuid(),
    name: z.string(),
  }),
  /** ISO 8601 UTC instant at which this check-in was recorded. */
  checkedInAt: z.string(),
});

export type CheckInResponse = z.infer<typeof checkInResponseSchema>;

export const issueBadgeResponseSchema = z.strictObject({
  participantId: z.uuid(),
  participantName: participantNameSchema,
  /** Raw token — presented once, at issuance. Stored only as a hash. */
  token: qrTokenSchema,
  issuedAt: isoTimestampSchema,
});

export type IssueBadgeResponse = z.infer<typeof issueBadgeResponseSchema>;

export const badgeSummarySchema = z.strictObject({
  participantId: z.uuid(),
  participantName: participantNameSchema,
  teamName: z.string(),
  issuedAt: isoTimestampSchema,
  revokedAt: isoTimestampSchema.optional(),
  checkedInAt: isoTimestampSchema.optional(),
});

export type BadgeSummary = z.infer<typeof badgeSummarySchema>;
