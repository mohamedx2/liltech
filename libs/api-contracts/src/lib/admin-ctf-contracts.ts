import { z } from 'zod';
import { teamStatusSchema } from './admin-operations-contracts.js';
import { isoTimestampSchema } from './common.js';
import { ctfStageStatusSchema, ctfTimingSchema } from './ctf-contracts.js';
import { eventPhaseSchema, teamProgressStateSchema } from './event-state.js';

/**
 * `GET /api/admin/ctf` — read-only Mini-CTF situation board for administrators.
 *
 * It reports configuration and progress only. Answers, answer digests and the
 * pepper never appear: a stage exposes whether an answer is configured, never
 * what it is. Answers are changed through provisioning (docs/ctf/README.md),
 * not through the admin interface.
 */

export const adminCtfStageSchema = z.strictObject({
  slug: z.string(),
  position: z.number().int().positive(),
  title: z.string(),
  status: ctfStageStatusSchema,
  /** True when an answer digest is stored. The digest itself is never sent. */
  answerConfigured: z.boolean(),
  hasDriveUrl: z.boolean(),
  requiredForUnlock: z.boolean(),
  hintCount: z.number().int().nonnegative(),
  /** Teams that solved this stage. */
  solvedTeams: z.number().int().nonnegative(),
  /** All recorded flag attempts on this stage, every team included. */
  attempts: z.number().int().nonnegative(),
});

export type AdminCtfStage = z.infer<typeof adminCtfStageSchema>;

export const adminCtfTeamSchema = z.strictObject({
  teamId: z.string().uuid(),
  teamName: z.string(),
  standing: teamStatusSchema,
  progressState: teamProgressStateSchema,
  /** At least one member checked in: the only teams allowed to play. */
  checkedIn: z.boolean(),
  /** Position of the stage the team is on; null before it starts or once done. */
  currentStagePosition: z.number().int().positive().nullable(),
  solvedStages: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  lastActivityAt: isoTimestampSchema.nullable(),
  /** When the team cleared every required stage; null until then. */
  chainSolvedAt: isoTimestampSchema.nullable(),
  /** Automatic Mini-CTF points; null until the chain is solved. */
  points: z.number().nonnegative().nullable(),
});

export type AdminCtfTeam = z.infer<typeof adminCtfTeamSchema>;

export const adminCtfOverviewResponseSchema = z.strictObject({
  phase: eventPhaseSchema,
  timing: ctfTimingSchema,
  windowMinutes: z.number().int().positive(),
  totals: z.strictObject({
    stages: z.number().int().nonnegative(),
    liveStages: z.number().int().nonnegative(),
    /** Live or required stages that would block teams: draft or without an answer. */
    blockingStages: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
    checkedInTeams: z.number().int().nonnegative(),
    startedTeams: z.number().int().nonnegative(),
    completedTeams: z.number().int().nonnegative(),
  }),
  stages: z.array(adminCtfStageSchema),
  /** Every registered team; completed teams first, then by progress. */
  teams: z.array(adminCtfTeamSchema),
});

export type AdminCtfOverviewResponse = z.infer<typeof adminCtfOverviewResponseSchema>;
