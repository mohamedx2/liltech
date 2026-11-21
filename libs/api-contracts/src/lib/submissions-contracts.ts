import { z } from 'zod';
import { challengeAccessSchema, challengeScheduleSchema } from './challenges-contracts.js';
import { isoTimestampSchema } from './common.js';
import { eventPhaseSchema } from './event-state.js';

/**
 * Contract for team submissions.
 *
 * Challenge 01 takes ONE Google Drive link (poster, logo, teaser video).
 * Challenge 02 takes a GitHub repository URL plus a presentation link (an
 * optional technical report link is still accepted). Links only: there is no
 * file-upload pipeline in this platform, and deliverables are hosted outside it.
 *
 * Team endpoints:
 * - `GET  /api/submissions` — both challenges with access, deadlines and history
 * - `POST /api/submissions` — record a submission (append-only history)
 *
 * Server rules (never decided by the client):
 * - the event must be `live`;
 * - the challenge must be readable for the caller's team;
 * - a `submissionDeadline` set by organizers is enforced, as is the challenge end;
 * - only links on the expected hosts are accepted.
 */

export const driveUrlMaxLength = 2000;

/** Google Drive / Docs links only: https, no embedded credentials. */
export const driveUrlSchema = z
  .string()
  .trim()
  .max(driveUrlMaxLength, 'That link is too long.')
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      return (
        parsed.protocol === 'https:' &&
        !parsed.username &&
        !parsed.password &&
        (parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com')
      );
    },
    { message: 'Use an https://drive.google.com or https://docs.google.com link.' },
  );

/** `https://github.com/<owner>/<repo>` (an optional trailing `.git`/slash is allowed). */
export const githubRepoUrlSchema = z
  .string()
  .trim()
  .max(driveUrlMaxLength, 'That link is too long.')
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'github.com' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        return false;
      }
      return /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(parsed.pathname);
    },
    { message: 'Use a repository link in the form https://github.com/<owner>/<repo>.' },
  );

export const submissionChallenge01RequestSchema = z.strictObject({
  challengePosition: z.literal(1),
  driveUrl: driveUrlSchema,
});

export const submissionChallenge02RequestSchema = z.strictObject({
  challengePosition: z.literal(2),
  githubUrl: githubRepoUrlSchema,
  /** Optional: organizers ask for the repository and the presentation. */
  reportUrl: driveUrlSchema.optional(),
  presentationUrl: driveUrlSchema,
});

export const createSubmissionRequestSchema = z.discriminatedUnion('challengePosition', [
  submissionChallenge01RequestSchema,
  submissionChallenge02RequestSchema,
]);

export type CreateSubmissionRequest = z.infer<typeof createSubmissionRequestSchema>;

export const submissionItemSchema = z.strictObject({
  id: z.uuid(),
  challengeId: z.uuid(),
  challengePosition: z.number().int().positive(),
  driveUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  reportUrl: z.string().nullable(),
  presentationUrl: z.string().nullable(),
  /** Best-effort GitHub HEAD at submission time; null when the API call failed. */
  commitSha: z.string().nullable(),
  submittedAt: isoTimestampSchema,
  /** True for the newest submission of this challenge (the one that counts). */
  isCurrent: z.boolean(),
});

export type SubmissionItem = z.infer<typeof submissionItemSchema>;

/** Why a team cannot submit to a challenge right now. */
export const submissionBlockedReasonSchema = z.enum([
  'EVENT_NOT_LIVE',
  'CHALLENGE_LOCKED',
  'SUBMISSIONS_CLOSED',
  'DEADLINE_PASSED',
  'CHALLENGE_NOT_STARTED',
]);

export type SubmissionBlockedReason = z.infer<typeof submissionBlockedReasonSchema>;

export const challengeSubmissionStateSchema = z.strictObject({
  challenge: challengeScheduleSchema,
  access: challengeAccessSchema,
  /** Server decision: may this team submit right now? */
  canSubmit: z.boolean(),
  /** Null when `canSubmit` is true. */
  blockedReason: submissionBlockedReasonSchema.nullable(),
  /** The one that counts; null before the first submission. */
  current: submissionItemSchema.nullable(),
  /** Append-only history, newest first. */
  history: z.array(submissionItemSchema),
});

export type ChallengeSubmissionState = z.infer<typeof challengeSubmissionStateSchema>;

export const submissionsOverviewResponseSchema = z.strictObject({
  phase: eventPhaseSchema,
  serverTime: isoTimestampSchema,
  items: z.array(challengeSubmissionStateSchema),
});

export type SubmissionsOverviewResponse = z.infer<typeof submissionsOverviewResponseSchema>;
