import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { eventPhaseSchema } from './event-state.js';

/**
 * Contract for the main challenges.
 *
 * The event runs two challenges one after the other. Each is started and
 * ended by an administrator, only while the event phase is `live`. When a
 * challenge starts, teams that solved that challenge's Mini-CTF can read its
 * description at once; everyone else can read it from `publicAt`
 * (start + `publicDelayMinutes`, one hour by default).
 *
 * Team endpoints (team role):
 * - `GET /api/challenges`         — every challenge with the caller's access state
 * - `GET /api/challenges/current` — the running (or last) challenge, or why none is readable
 *
 * Admin endpoints (admin role, audited):
 * - `GET   /api/admin/challenges`
 * - `POST  /api/admin/challenges`
 * - `PATCH /api/admin/challenges/:id`
 * - `POST  /api/admin/challenges/:id/start` — event must be `live`
 * - `POST  /api/admin/challenges/:id/end`   — event must be `live`
 */

export const challengeStatusSchema = z.enum(['upcoming', 'live', 'ended']);

export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;

export const challengeResourceLinkSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  url: z.url().max(2000),
});

export type ChallengeResourceLink = z.infer<typeof challengeResourceLinkSchema>;

/** Default delay between a challenge start and its public reveal. */
export const DEFAULT_CHALLENGE_PUBLIC_DELAY_MINUTES = 60;

const challengeContentShape = {
  title: z.string().trim().min(1).max(150),
  /** Short teaser shown to every team, even before the description unlocks. */
  summary: z.string().trim().max(500),
  description: z.string().trim().min(1).max(20_000),
  problemStatement: z.string().trim().max(20_000),
  deliverables: z.array(z.string().trim().min(1).max(500)).max(30),
  resources: z.array(challengeResourceLinkSchema).max(30),
  /** Minutes after the start before every team can read the description. */
  publicDelayMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
};

export const createChallengeRequestSchema = z.strictObject({
  /** 1 for the first challenge, 2 for the second; defines the running order. */
  position: z.number().int().min(1).max(10),
  ...challengeContentShape,
  summary: challengeContentShape.summary.default(''),
  problemStatement: challengeContentShape.problemStatement.default(''),
  deliverables: challengeContentShape.deliverables.default([]),
  resources: challengeContentShape.resources.default([]),
  publicDelayMinutes: challengeContentShape.publicDelayMinutes.default(
    DEFAULT_CHALLENGE_PUBLIC_DELAY_MINUTES,
  ),
});

export type CreateChallengeRequest = z.infer<typeof createChallengeRequestSchema>;

export const updateChallengeRequestSchema = z
  .strictObject({
    title: challengeContentShape.title.optional(),
    summary: challengeContentShape.summary.optional(),
    description: challengeContentShape.description.optional(),
    problemStatement: challengeContentShape.problemStatement.optional(),
    deliverables: challengeContentShape.deliverables.optional(),
    resources: challengeContentShape.resources.optional(),
    publicDelayMinutes: challengeContentShape.publicDelayMinutes.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update.',
  });

export type UpdateChallengeRequest = z.infer<typeof updateChallengeRequestSchema>;

export const challengeIdParamsSchema = z.strictObject({
  id: z.uuid(),
});

/** Status and timing, visible to every team. */
export const challengeScheduleSchema = z.strictObject({
  id: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  summary: z.string(),
  status: challengeStatusSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema.nullable(),
  /** When every team can read the description; set when the challenge starts. */
  publicAt: isoTimestampSchema.nullable(),
  publicDelayMinutes: z.number().int(),
});

export type ChallengeSchedule = z.infer<typeof challengeScheduleSchema>;

/** The readable body of a challenge. */
export const challengeContentSchema = z.strictObject({
  description: z.string(),
  problemStatement: z.string(),
  deliverables: z.array(z.string()),
  resources: z.array(challengeResourceLinkSchema),
});

export type ChallengeContent = z.infer<typeof challengeContentSchema>;

export const challengeAdminDetailSchema = challengeScheduleSchema.extend({
  ...challengeContentSchema.shape,
  /** Teams that solved this challenge's Mini-CTF. */
  ctfSolvedTeams: z.number().int().nonnegative(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type ChallengeAdminDetail = z.infer<typeof challengeAdminDetailSchema>;

export const adminChallengeListResponseSchema = z.strictObject({
  items: z.array(challengeAdminDetailSchema),
  total: z.number().int().nonnegative(),
});

export type AdminChallengeListResponse = z.infer<typeof adminChallengeListResponseSchema>;

/**
 * How the caller team can read a challenge:
 * - `locked`: not started, or started but not public yet and the team has
 *   not solved this challenge's Mini-CTF;
 * - `early`: unlocked before `publicAt` by solving the Mini-CTF;
 * - `public`: `publicAt` has passed (or the challenge ended).
 */
export const challengeAccessSchema = z.enum(['locked', 'early', 'public']);

export type ChallengeAccess = z.infer<typeof challengeAccessSchema>;

export const teamChallengeViewSchema = z.strictObject({
  challenge: challengeScheduleSchema,
  access: challengeAccessSchema,
  ctfSolved: z.boolean(),
  /** Present only when `access` is not `locked`. */
  content: challengeContentSchema.nullable(),
});

export type TeamChallengeView = z.infer<typeof teamChallengeViewSchema>;

/** Why no challenge content can be returned yet. */
export const challengeUnavailableReasonSchema = z.enum([
  'EVENT_NOT_STARTED',
  'NO_CHALLENGE_STARTED',
]);

export const challengeUnavailableSchema = z.strictObject({
  available: z.literal(false),
  reason: challengeUnavailableReasonSchema,
  phase: eventPhaseSchema,
  message: z.string(),
});

export type ChallengeUnavailable = z.infer<typeof challengeUnavailableSchema>;

export const teamChallengeListResponseSchema = z.discriminatedUnion('available', [
  challengeUnavailableSchema,
  z.strictObject({
    available: z.literal(true),
    phase: eventPhaseSchema,
    serverTime: isoTimestampSchema,
    items: z.array(teamChallengeViewSchema),
  }),
]);

export type TeamChallengeListResponse = z.infer<typeof teamChallengeListResponseSchema>;

export const currentChallengeResponseSchema = z.discriminatedUnion('available', [
  challengeUnavailableSchema,
  z.strictObject({
    available: z.literal(true),
    phase: eventPhaseSchema,
    serverTime: isoTimestampSchema,
    /** `access` says whether `content` is readable; when locked, `publicAt` says when. */
    current: teamChallengeViewSchema,
  }),
]);

export type CurrentChallengeResponse = z.infer<typeof currentChallengeResponseSchema>;
