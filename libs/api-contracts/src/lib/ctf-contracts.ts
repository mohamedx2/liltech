import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * Contract for the LOUAGE 404 Mini-CTF.
 *
 * - `GET  /api/ctf/chain`             — the seven-stage tracker + the stage the
 *                                       team may work on now (never locked ones)
 * - `GET  /api/ctf/stages/:slug`      — one stage, refused when locked
 * - `POST /api/ctf/stages/:slug/hints`   — reveal the next hint
 * - `POST /api/ctf/stages/:slug/submit`  — validate a flag, unlock the next stage
 *
 * No answer, digest, pepper or organizer configuration ever appears here.
 * Stage content (title, description, hints, Drive URL) is participant-facing.
 */

export const ctfAnswerMaxLength = 200;

export const ctfAnswerSchema = z
  .string()
  .trim()
  .min(1, 'Enter the flag you found.')
  .max(ctfAnswerMaxLength, 'That flag is too long.');

/** Publication state of a stage, as seen by a team. */
export const ctfStageStatusSchema = z.enum(['draft', 'live', 'closed']);

export type CtfStageStatus = z.infer<typeof ctfStageStatusSchema>;

/** A team's relationship to one stage. */
export const ctfStageStateSchema = z.enum(['locked', 'unlocked', 'solved']);

export type CtfStageState = z.infer<typeof ctfStageStateSchema>;

/** One row of the stage tracker. Deliberately carries no stage content. */
export const ctfTrackItemSchema = z.strictObject({
  slug: z.string(),
  position: z.number().int().positive(),
  title: z.string(),
  state: ctfStageStateSchema,
  status: ctfStageStatusSchema,
  requiredForUnlock: z.boolean(),
});

export type CtfTrackItem = z.infer<typeof ctfTrackItemSchema>;

export const ctfHintViewSchema = z.strictObject({
  position: z.number().int().positive(),
  body: z.string(),
});

export type CtfHintView = z.infer<typeof ctfHintViewSchema>;

export const ctfStageDetailSchema = z.strictObject({
  slug: z.string(),
  position: z.number().int().positive(),
  totalStages: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  status: ctfStageStatusSchema,
  state: ctfStageStateSchema,
  /** Google Drive folder with the stage resources, when the organizer set one. */
  assetDriveUrl: z.string().nullable(),
  hintCount: z.number().int().nonnegative(),
});

export type CtfStageDetail = z.infer<typeof ctfStageDetailSchema>;

export const ctfStageProgressSchema = z.strictObject({
  attempts: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  solved: z.boolean(),
  solvedAt: isoTimestampSchema.nullable(),
});

export type CtfStageProgress = z.infer<typeof ctfStageProgressSchema>;

export const ctfCurrentStageSchema = z.strictObject({
  stage: ctfStageDetailSchema,
  progress: ctfStageProgressSchema,
  /** Only hints this team has already revealed. */
  hints: z.array(ctfHintViewSchema),
});

export type CtfCurrentStage = z.infer<typeof ctfCurrentStageSchema>;

export const ctfChainResponseSchema = z.strictObject({
  /** The authenticated team, resolved server-side (never from the request). */
  team: z.strictObject({ name: z.string() }),
  stages: z.array(ctfTrackItemSchema),
  /** Null when the team has finished every required stage or is ineligible. */
  current: ctfCurrentStageSchema.nullable(),
  summary: z.strictObject({
    solved: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** True when the team is checked in and may play at all. */
  eligible: z.boolean(),
});

export type CtfChainResponse = z.infer<typeof ctfChainResponseSchema>;

export const ctfStageResponseSchema = ctfCurrentStageSchema;

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
  correct: z.literal(true),
  stageSolved: z.literal(true),
  stageSlug: z.string(),
  nextStageUnlocked: z.boolean(),
  nextStagePosition: z.number().int().positive().nullable(),
  /** True when every required stage is solved: the main challenge is open. */
  completedChain: z.boolean(),
  message: z.string(),
});

export type CtfSubmitResponse = z.infer<typeof ctfSubmitResponseSchema>;

/**
 * `GET /api/challenges/current` — refused with `403 CTF_NOT_SOLVED` until every
 * required Mini-CTF stage is solved. The main brief is not published yet, so an
 * unlocked team gets that fact explicitly instead of invented content.
 */
export const currentChallengeResponseSchema = z.strictObject({
  unlocked: z.literal(true),
  challenge: z.null(),
  message: z.string(),
});

export type CurrentChallengeResponse = z.infer<typeof currentChallengeResponseSchema>;
