import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Team scoring and results (admin role only).
 *
 * The final event score is out of 100:
 * - Mini-CTF     — 10 points, taken as-is (0–10, automatic by solve time);
 * - Challenge 01 — 20% of its challenge score (0–100);
 * - Challenge 02 — 70% of its challenge score (0–100).
 *
 * A challenge score is the average of the assigned jurors' weighted totals
 * (see `juryWeightedTotal` in jury-contracts), 0 when no juror scored the team yet.
 * Administrators may override the Mini-CTF points and either challenge score
 * for any team; an override replaces the computed value until it is cleared.
 * Jurors keep scoring their assigned challenge through the jury endpoints.
 *
 * - `GET   /api/admin/results`               — every active team, ranked by total
 * - `PATCH /api/admin/teams/:teamId/scores`  — set or clear overrides (audited)
 */

/** Maximum Mini-CTF points, which are also its share of the final score. */
export const CTF_MAX_POINTS = 10;

/** A challenge score is out of 100 before its weight applies. */
export const CHALLENGE_SCORE_MAX = 100;

/** Share of the final score (percent) per challenge, keyed by challenge position. */
export const CHALLENGE_WEIGHTS: Readonly<Record<1 | 2, number>> = { 1: 20, 2: 70 };

export const challengePositionSchema = z.union([z.literal(1), z.literal(2)]);

export type ChallengePosition = z.infer<typeof challengePositionSchema>;

export const teamChallengeScoreSchema = z.strictObject({
  position: challengePositionSchema,
  /** `null` when this challenge has not been created yet. */
  challengeId: z.uuid().nullable(),
  challengeTitle: z.string().nullable(),
  /** Average of the jurors' weighted totals (0–100); `null` when nobody scored. */
  juryAverage: z.number().min(0).max(CHALLENGE_SCORE_MAX).nullable(),
  jurorCount: z.number().int().nonnegative(),
  /** Administrator override (0–100); `null` when none. */
  override: z.number().min(0).max(CHALLENGE_SCORE_MAX).nullable(),
  /** Score in use: the override, else the jury average, else 0. */
  score: z.number().min(0).max(CHALLENGE_SCORE_MAX),
  /** Points this challenge adds to the final score. */
  points: z.number().min(0),
});

export type TeamChallengeScore = z.infer<typeof teamChallengeScoreSchema>;

export const teamCtfScoreSchema = z.strictObject({
  /** Points from the solve time; `null` until the team cleared the chain. */
  automatic: z.number().min(0).max(CTF_MAX_POINTS).nullable(),
  /** Administrator override; `null` when none. */
  override: z.number().min(0).max(CTF_MAX_POINTS).nullable(),
  /** Points in use: the override, else the automatic points, else 0. */
  points: z.number().min(0).max(CTF_MAX_POINTS),
});

export type TeamCtfScore = z.infer<typeof teamCtfScoreSchema>;

export const teamResultSchema = z.strictObject({
  /** 1-based; tied totals share a rank. */
  rank: z.number().int().positive(),
  teamId: z.uuid(),
  teamName: z.string(),
  ctf: teamCtfScoreSchema,
  challenges: z.array(teamChallengeScoreSchema),
  /** Final score out of 100. */
  total: z.number().min(0).max(100),
});

export type TeamResult = z.infer<typeof teamResultSchema>;

export const adminResultsResponseSchema = z.strictObject({
  generatedAt: isoTimestampSchema,
  teams: z.array(teamResultSchema),
});

export type AdminResultsResponse = z.infer<typeof adminResultsResponseSchema>;

/** Up to two decimals, the precision results are shown with. */
const scoreValue = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: 'Use at most two decimals.',
    });

/**
 * Omit a field to leave it unchanged; `null` clears the override so the
 * computed value applies again.
 */
export const updateTeamScoresRequestSchema = z
  .strictObject({
    ctfPoints: scoreValue(CTF_MAX_POINTS).nullable().optional(),
    challenge1Score: scoreValue(CHALLENGE_SCORE_MAX).nullable().optional(),
    challenge2Score: scoreValue(CHALLENGE_SCORE_MAX).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one score to update.',
  });

export type UpdateTeamScoresRequest = z.infer<typeof updateTeamScoresRequestSchema>;
