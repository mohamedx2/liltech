import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for the Mini-CTF gate (stage 1, "Louage 404"):
 * - `GET  /api/ctf/stage`   — the current stage, the team's progress and the
 *                             hints already unlocked (never the full hint set)
 * - `POST /api/ctf/stage/hints` — reveal the next hint, one per call
 * - `POST /api/ctf/stage/submit` — validate an answer; a correct answer
 *                             unlocks the main challenge, idempotently
 *
 * Answer material only travels client → server. The server compares a
 * SHA-256 hash of the normalized answer, so no plaintext answer — and no
 * per-attempt grading detail — is ever returned.
 */

/** Maximum accepted answer length before normalization. */
export const ctfAnswerMaxLength = 120;

export const ctfAnswerSchema = z
  .string()
  .trim()
  .min(1, 'Enter the flag you found.')
  .max(ctfAnswerMaxLength, 'That answer is too long.');

export const ctfHintViewSchema = z.strictObject({
  position: z.number().int().positive(),
  body: z.string(),
});

export type CtfHintView = z.infer<typeof ctfHintViewSchema>;

export const ctfStageSummarySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  position: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  assetImageUrl: z.string().nullable(),
  assetZipUrl: z.string().nullable(),
  hintCount: z.number().int().nonnegative(),
});

export type CtfStageSummary = z.infer<typeof ctfStageSummarySchema>;

export const ctfTeamProgressSchema = z.strictObject({
  /** True when the stage is live and the team has checked in. */
  isOpen: z.boolean(),
  isSolved: z.boolean(),
  solvedAt: isoTimestampSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  mainChallengeUnlocked: z.boolean(),
});

export type CtfTeamProgress = z.infer<typeof ctfTeamProgressSchema>;

export const ctfStageResponseSchema = z.strictObject({
  stage: ctfStageSummarySchema,
  progress: ctfTeamProgressSchema,
  hints: z.array(ctfHintViewSchema),
});

export type CtfStageResponse = z.infer<typeof ctfStageResponseSchema>;

export const ctfHintResponseSchema = z.strictObject({
  hint: ctfHintViewSchema,
  hintsUsed: z.number().int().nonnegative(),
  hintCount: z.number().int().nonnegative(),
});

export type CtfHintResponse = z.infer<typeof ctfHintResponseSchema>;

export const ctfSubmitRequestSchema = z.strictObject({
  answer: ctfAnswerSchema,
});

export type CtfSubmitRequest = z.infer<typeof ctfSubmitRequestSchema>;

export const ctfSubmitResponseSchema = z.strictObject({
  success: z.literal(true),
  message: z.string(),
  isSolved: z.literal(true),
  solvedAt: isoTimestampSchema,
  mainChallengeUnlocked: z.literal(true),
});

export type CtfSubmitResponse = z.infer<typeof ctfSubmitResponseSchema>;

/**
 * `GET /api/challenges/current` — the main challenge brief. Refused with
 * `403 CTF_NOT_SOLVED` until the gate is solved. Challenge content for the
 * main track is not published yet, so the payload states that explicitly
 * instead of inventing a brief.
 */
export const currentChallengeResponseSchema = z.strictObject({
  unlocked: z.literal(true),
  challenge: z.null(),
  message: z.string(),
});

export type CurrentChallengeResponse = z.infer<typeof currentChallengeResponseSchema>;
