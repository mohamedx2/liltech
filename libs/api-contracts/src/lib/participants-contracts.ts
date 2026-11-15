import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { teamProgressStateSchema } from './event-state.js';

/**
 * Contract for the team portal (participants module). Every endpoint is
 * scoped to the authenticated team account — no team identifier is ever
 * accepted from the client.
 * - `GET  /api/participants/team`                              — the team and its members
 * - `GET  /api/participants/badge`                             — every member's QR badge
 * - `POST /api/participants/badge/:participantId/resend-email` — resend one badge email (once per hour)
 */

/** Badge colors, assigned server-side so the four groups stay balanced. */
export const BadgeColor = {
  Blue: 'blue',
  Red: 'red',
  Yellow: 'yellow',
  Green: 'green',
} as const;

export type BadgeColor = (typeof BadgeColor)[keyof typeof BadgeColor];

export const BADGE_COLORS: readonly BadgeColor[] = [
  BadgeColor.Blue,
  BadgeColor.Red,
  BadgeColor.Yellow,
  BadgeColor.Green,
];

export const badgeColorSchema = z.enum([
  BadgeColor.Blue,
  BadgeColor.Red,
  BadgeColor.Yellow,
  BadgeColor.Green,
]);

/** Delivery state of a participant's badge email. */
export const badgeEmailStatusSchema = z.enum(['pending', 'sent', 'failed']);

export type BadgeEmailStatus = z.infer<typeof badgeEmailStatusSchema>;

/** Minimum delay between two badge emails to the same participant. */
export const BADGE_EMAIL_RESEND_INTERVAL_MS = 60 * 60 * 1000;

export const teamMemberProfileSchema = z.strictObject({
  id: z.uuid(),
  teamId: z.uuid(),
  fullName: z.string(),
  email: z.string().nullable(),
  roleInTeam: z.enum(['leader', 'member']),
  color: badgeColorSchema.nullable(),
  isCheckedIn: z.boolean(),
});

export type TeamMemberProfile = z.infer<typeof teamMemberProfileSchema>;

export const teamPortalSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  progress: teamProgressStateSchema,
  /** True once at least one member has been checked in. */
  isCheckedIn: z.boolean(),
  members: z.array(teamMemberProfileSchema),
});

export type TeamPortalSummary = z.infer<typeof teamPortalSummarySchema>;

export const teamMemberBadgeSchema = z.strictObject({
  participantId: z.uuid(),
  participantName: z.string(),
  roleInTeam: z.enum(['leader', 'member']),
  color: badgeColorSchema.nullable(),
  /**
   * Raw badge token, readable only by the owning team. `null` when the badge
   * is revoked or was issued before retrievable storage existed — a resend
   * then issues a fresh badge.
   */
  qrToken: z.string().nullable(),
  /** PNG data URL of the QR code encoding `qrToken`, or `null` alongside it. */
  qrImageDataUrl: z.string().nullable(),
  isRevoked: z.boolean(),
  isCheckedIn: z.boolean(),
  email: z.string().nullable(),
  emailStatus: badgeEmailStatusSchema.nullable(),
  emailLastSentAt: isoTimestampSchema.nullable(),
  /** Earliest time a resend is accepted; `null` when one is allowed now. */
  emailResendAvailableAt: isoTimestampSchema.nullable(),
});

export type TeamMemberBadge = z.infer<typeof teamMemberBadgeSchema>;

export const teamBadgesResponseSchema = z.strictObject({
  teamId: z.uuid(),
  teamName: z.string(),
  badges: z.array(teamMemberBadgeSchema),
});

export type TeamBadgesResponse = z.infer<typeof teamBadgesResponseSchema>;

export const participantIdParamsSchema = z.strictObject({
  participantId: z.uuid(),
});

export const resendBadgeEmailResponseSchema = z.strictObject({
  participantId: z.uuid(),
  emailStatus: badgeEmailStatusSchema,
  emailLastSentAt: isoTimestampSchema,
  emailResendAvailableAt: isoTimestampSchema,
});

export type ResendBadgeEmailResponse = z.infer<typeof resendBadgeEmailResponseSchema>;

/** `POST /api/admin/badges/send-unsent` — emails queued in the background. */
export const sendUnsentBadgeEmailsResponseSchema = z.strictObject({
  queued: z.number().int().nonnegative(),
});

export type SendUnsentBadgeEmailsResponse = z.infer<typeof sendUnsentBadgeEmailsResponseSchema>;
