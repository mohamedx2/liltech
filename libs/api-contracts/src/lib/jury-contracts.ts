import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { challengeTrackSchema, eventPhaseSchema, teamProgressStateSchema } from './event-state.js';

/**
 * Jury evaluation contract (jury role only). A jury account is assigned one
 * challenge by an administrator and scores every active, checked-in team on
 * that challenge:
 * - `GET  /api/jury/overview`              — assigned challenge and progress
 * - `GET  /api/jury/teams`                 — teams to score, with their submission
 * - `GET  /api/jury/evaluation?teamId=…`   — one team, its submission and my scores
 * - `POST /api/jury/evaluation?teamId=…`   — save my scores (scoring window only)
 *
 * Scores are stored per juror. Each criterion is entered out of 25 and
 * weighted (Solution 35 · Innovation 25 · Technique 25 · Pitching 15), so every
 * total sent here is a weighted score out of 100. A team's challenge score is
 * the average of its jurors' totals (see `results-contracts`).
 */

export const JURY_CRITERION_MAX_POINTS = 25;

export const JURY_EVALUATION_CRITERIA = [
  {
    key: 'ui_ux_design',
    title: 'Solution',
    weight: 35,
    maxPoints: JURY_CRITERION_MAX_POINTS,
    description: 'Does the result answer the challenge brief, completely and well?',
  },
  {
    key: 'innovation_originality',
    title: 'Innovation',
    weight: 25,
    maxPoints: JURY_CRITERION_MAX_POINTS,
    description: 'Is the idea original, and the approach clever and relevant?',
  },
  {
    key: 'technical_execution',
    title: 'Technique',
    weight: 25,
    maxPoints: JURY_CRITERION_MAX_POINTS,
    description: 'Is it well made? Execution quality, stability, a working result.',
  },
  {
    key: 'pitch_presentation',
    title: 'Pitching',
    weight: 15,
    maxPoints: JURY_CRITERION_MAX_POINTS,
    description: 'Clear pitch, good answers to the questions, team cohesion.',
  },
] as const;

/**
 * Weighted total out of 100: each criterion counts `score / maxPoints × weight`.
 * Rounded to two decimals.
 */
export function juryWeightedTotal(scores: Readonly<Record<JuryCriterionKey, number>>): number {
  const total = JURY_EVALUATION_CRITERIA.reduce(
    (sum, criterion) => sum + (scores[criterion.key] * criterion.weight) / criterion.maxPoints,
    0,
  );
  return Math.round(total * 100) / 100;
}

export type JuryCriterionKey = (typeof JURY_EVALUATION_CRITERIA)[number]['key'];

/** Event phases during which jurors may save scores (organizer decision). */
export const JURY_SCORING_PHASES = ['submissions_closed', 'pitching'] as const;

const criterionScoreSchema = z.number().int().min(0).max(JURY_CRITERION_MAX_POINTS);

export const juryCriteriaScoresSchema = z.strictObject({
  technical_execution: criterionScoreSchema,
  innovation_originality: criterionScoreSchema,
  ui_ux_design: criterionScoreSchema,
  pitch_presentation: criterionScoreSchema,
});

export type JuryCriteriaScores = z.infer<typeof juryCriteriaScoresSchema>;

export const juryNotesMaxLength = 2000;

export const submitEvaluationRequestSchema = z.strictObject({
  criteriaScores: juryCriteriaScoresSchema,
  notes: z.string().max(juryNotesMaxLength).optional(),
});

export type SubmitEvaluationRequest = z.infer<typeof submitEvaluationRequestSchema>;

export const juryTeamQuerySchema = z.strictObject({
  teamId: z.uuid(),
});

/** Server ids are UUIDs; output schemas accept any id so mock data stays readable. */
const idSchema = z.string().min(1);

export const juryTeamItemSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  track: challengeTrackSchema,
  progress: teamProgressStateSchema,
  membersCount: z.number().int().positive(),
  /** True once the team submitted at least once for this challenge. */
  submitted: z.boolean(),
  submittedAt: isoTimestampSchema.nullable(),
  submissionTitle: z.string().nullable(),
  /** The main link of the latest submission (GitHub, otherwise Google Drive). */
  submissionRepoUrl: z.string().nullable(),
  submissionFileName: z.string().nullable(),
  evaluationStatus: z.enum(['graded', 'pending']),
  /** My weighted total for this team (0–100); `null` until I score it. */
  myScore: z.number().nullable(),
  evaluatedAt: isoTimestampSchema.nullable(),
});

export type JuryTeamItem = z.infer<typeof juryTeamItemSchema>;

export const juryOverviewResponseSchema = z.strictObject({
  track: challengeTrackSchema,
  trackTitle: z.string(),
  trackDescription: z.string(),
  assignedJury: z.strictObject({
    id: idSchema,
    name: z.string(),
    email: z.email(),
  }),
  eventPhase: eventPhaseSchema,
  totalTeams: z.number().int().nonnegative(),
  evaluatedTeams: z.number().int().nonnegative(),
  pendingTeams: z.number().int().nonnegative(),
  /** Average of my own totals; `null` before my first score. */
  averageScore: z.number().nullable(),
  scoringOpen: z.boolean(),
});

export type JuryOverviewResponse = z.infer<typeof juryOverviewResponseSchema>;

/** The team's latest submission for the challenge (the one that counts). */
export const jurySubmissionSchema = z.strictObject({
  submittedAt: isoTimestampSchema,
  /** How many times the team submitted; the latest one is judged. */
  version: z.number().int().positive(),
  driveUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  reportUrl: z.string().nullable(),
  presentationUrl: z.string().nullable(),
  /** Default-branch HEAD at submission time, when GitHub answered. */
  commitSha: z.string().nullable(),
});

export type JurySubmission = z.infer<typeof jurySubmissionSchema>;

export const juryEvaluationSchema = z.strictObject({
  criteriaScores: juryCriteriaScoresSchema,
  notes: z.string(),
  /** Weighted total out of 100. */
  totalScore: z.number(),
  evaluatedAt: isoTimestampSchema,
});

export type JuryEvaluation = z.infer<typeof juryEvaluationSchema>;

export const juryTeamEvaluationResponseSchema = z.strictObject({
  team: juryTeamItemSchema,
  members: z.array(
    z.strictObject({
      id: idSchema,
      fullName: z.string(),
      roleInTeam: z.enum(['leader', 'member']),
    }),
  ),
  submission: jurySubmissionSchema.nullable(),
  evaluation: juryEvaluationSchema.nullable(),
  scoringOpen: z.boolean(),
});

export type JuryTeamEvaluationResponse = z.infer<typeof juryTeamEvaluationResponseSchema>;

export const submitEvaluationResponseSchema = z.strictObject({
  success: z.literal(true),
  teamId: idSchema,
  /** Weighted total out of 100. */
  totalScore: z.number(),
  evaluatedAt: isoTimestampSchema,
  message: z.string(),
});

export type SubmitEvaluationResponse = z.infer<typeof submitEvaluationResponseSchema>;
