import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { eventPhaseSchema, teamProgressStateSchema } from './event-state.js';
import { challengeStatusSchema } from './challenges-contracts.js';
import { badgeColorSchema, badgeEmailStatusSchema } from './participants-contracts.js';
import { participantNameSchema, teamMemberInputSchema } from './registration-contracts.js';

/**
 * Contract for the admin operations toolkit (admin role only, every write is
 * audited). Team and participant writes respond with the refreshed `AdminTeam`. These are the tools organizers need to handle what goes wrong on
 * event night: lost badges, typos in emails, late or missing members, teams
 * locked out of their account, no-shows, rule violations, a broken Mini-CTF,
 * or a wrong announcement.
 *
 * - `GET    /api/admin/overview`                               — live situation board
 * - `GET    /api/admin/teams`                                  — roster with contact and badge state
 * - `GET    /api/admin/teams/:teamId`                          — one team, same shape
 * - `PATCH  /api/admin/teams/:teamId`                          — rename
 * - `POST   /api/admin/teams/:teamId/status`                   — active / withdrawn / disqualified
 * - `POST   /api/admin/teams/:teamId/reset-password`           — new leader password, sessions ended
 * - `DELETE /api/admin/teams/:teamId`                          — before the event goes live only
 * - `POST   /api/admin/teams/:teamId/participants`             — add a member (max team size)
 * - `PATCH  /api/admin/participants/:participantId`            — fix name / email
 * - `DELETE /api/admin/participants/:participantId`            — remove a non-leader member
 * - `POST   /api/admin/participants/:participantId/check-in`   — manual check-in (no QR)
 * - `DELETE /api/admin/participants/:participantId/check-in`   — undo a mistaken check-in
 * - `POST   /api/admin/participants/:participantId/reissue-badge` — new QR, old one stops working
 * - `POST   /api/admin/badges/resend-failed`                   — retry every failed badge email
 * - `POST   /api/admin/teams/:teamId/ctf-solves`               — grant Mini-CTF early access
 * - `DELETE /api/admin/teams/:teamId/ctf-solves/:challengeId`  — withdraw it
 * - `DELETE /api/announcements/:announcementId`                — remove a wrong announcement
 */

// ── Team status ──────────────────────────────────────────────────────────────

/**
 * Administrative standing of a team, separate from its event progress.
 * A team that is not `active` cannot be checked in and cannot read challenges.
 */
export const TeamStatus = {
  Active: 'active',
  Withdrawn: 'withdrawn',
  Disqualified: 'disqualified',
} as const;

export type TeamStatus = (typeof TeamStatus)[keyof typeof TeamStatus];

export const teamStatusSchema = z.enum([
  TeamStatus.Active,
  TeamStatus.Withdrawn,
  TeamStatus.Disqualified,
]);

const STATUS_REASON_MAX = 300;

// ── Params ───────────────────────────────────────────────────────────────────

export const teamIdParamsSchema = z.strictObject({
  teamId: z.uuid(),
});

export const teamCtfSolveParamsSchema = z.strictObject({
  teamId: z.uuid(),
  challengeId: z.uuid(),
});

export const announcementIdParamsSchema = z.strictObject({
  announcementId: z.uuid(),
});

// ── Roster ───────────────────────────────────────────────────────────────────

export const adminParticipantBadgeSchema = z.strictObject({
  issuedAt: isoTimestampSchema,
  revokedAt: isoTimestampSchema.nullable(),
  emailStatus: badgeEmailStatusSchema.nullable(),
  emailLastSentAt: isoTimestampSchema.nullable(),
});

export type AdminParticipantBadge = z.infer<typeof adminParticipantBadgeSchema>;

export const adminParticipantSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  isLeader: z.boolean(),
  email: z.string().nullable(),
  color: badgeColorSchema.nullable(),
  checkedInAt: isoTimestampSchema.nullable(),
  /** Staff member who recorded the check-in. */
  checkedInByName: z.string().nullable(),
  /** `null` when the participant has no badge at all. */
  badge: adminParticipantBadgeSchema.nullable(),
});

export type AdminParticipant = z.infer<typeof adminParticipantSchema>;

export const adminTeamCtfSolveSchema = z.strictObject({
  challengeId: z.uuid(),
  challengeTitle: z.string(),
  solvedAt: isoTimestampSchema,
});

export const adminTeamSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  progressState: teamProgressStateSchema,
  status: teamStatusSchema,
  statusReason: z.string().nullable(),
  statusChangedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  /** The team account (the leader logs in with this email). */
  leader: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
  }),
  participants: z.array(adminParticipantSchema),
  ctfSolves: z.array(adminTeamCtfSolveSchema),
});

export type AdminTeam = z.infer<typeof adminTeamSchema>;

// ── Team requests ────────────────────────────────────────────────────────────

export const renameTeamRequestSchema = z.strictObject({
  name: z.string().trim().min(3).max(60),
});

export type RenameTeamRequest = z.infer<typeof renameTeamRequestSchema>;

export const setTeamStatusRequestSchema = z
  .strictObject({
    status: teamStatusSchema,
    reason: z.string().trim().max(STATUS_REASON_MAX).optional(),
  })
  .refine((value) => value.status === TeamStatus.Active || Boolean(value.reason), {
    message: 'A reason is required to withdraw or disqualify a team.',
    path: ['reason'],
  });

export type SetTeamStatusRequest = z.infer<typeof setTeamStatusRequestSchema>;

export const resetTeamPasswordResponseSchema = z.strictObject({
  teamId: z.uuid(),
  /** Shown once to the administrator; only its hash is stored. */
  temporaryPassword: z.string(),
  /** Sessions of the team account that were signed out. */
  revokedSessions: z.number().int().nonnegative(),
});

export type ResetTeamPasswordResponse = z.infer<typeof resetTeamPasswordResponseSchema>;

// ── Participant requests ─────────────────────────────────────────────────────

export const addParticipantRequestSchema = teamMemberInputSchema;

export type AddParticipantRequest = z.infer<typeof addParticipantRequestSchema>;

export const updateParticipantRequestSchema = z
  .strictObject({
    name: participantNameSchema.optional(),
    email: z.email().optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined, {
    message: 'Provide at least one field to update.',
  });

export type UpdateParticipantRequest = z.infer<typeof updateParticipantRequestSchema>;

export const reissueBadgeResponseSchema = z.strictObject({
  participantId: z.uuid(),
  issuedAt: isoTimestampSchema,
  /** True when the new badge email was queued (the participant has an email). */
  emailQueued: z.boolean(),
});

export type ReissueBadgeResponse = z.infer<typeof reissueBadgeResponseSchema>;

export const bulkResendBadgeEmailsResponseSchema = z.strictObject({
  /** Badge emails queued for delivery. */
  queued: z.number().int().nonnegative(),
});

export type BulkResendBadgeEmailsResponse = z.infer<typeof bulkResendBadgeEmailsResponseSchema>;

// ── Mini-CTF override ────────────────────────────────────────────────────────

export const grantCtfSolveRequestSchema = z.strictObject({
  challengeId: z.uuid(),
});

export type GrantCtfSolveRequest = z.infer<typeof grantCtfSolveRequestSchema>;

// ── Overview ─────────────────────────────────────────────────────────────────

const count = z.number().int().nonnegative();

export const adminOverviewResponseSchema = z.strictObject({
  serverTime: isoTimestampSchema,
  phase: eventPhaseSchema,
  phaseChangedAt: isoTimestampSchema,
  teams: z.strictObject({
    total: count,
    active: count,
    withdrawn: count,
    disqualified: count,
    /** Active teams per progress state. */
    byProgress: z.record(teamProgressStateSchema, count),
    /** Active teams whose members are all checked in. */
    fullyCheckedIn: count,
    /** Active teams with some, but not all, members checked in. */
    partiallyCheckedIn: count,
    /** Active teams with no member checked in. */
    notCheckedIn: count,
  }),
  participants: z.strictObject({
    total: count,
    checkedIn: count,
    byColor: z.array(
      z.strictObject({
        color: badgeColorSchema,
        total: count,
        checkedIn: count,
      }),
    ),
  }),
  badges: z.strictObject({
    revoked: count,
    emailSent: count,
    emailPending: count,
    emailFailed: count,
    /** Participants without an email address (badge cannot be mailed). */
    missingEmail: count,
  }),
  challenges: z.array(
    z.strictObject({
      id: z.uuid(),
      position: z.number().int(),
      title: z.string(),
      status: challengeStatusSchema,
      startedAt: isoTimestampSchema.nullable(),
      publicAt: isoTimestampSchema.nullable(),
      endedAt: isoTimestampSchema.nullable(),
      ctfSolvedTeams: count,
    }),
  ),
  juryAccounts: count,
  announcements: z.strictObject({
    total: count,
    lastPublishedAt: isoTimestampSchema.nullable(),
  }),
});

export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;
