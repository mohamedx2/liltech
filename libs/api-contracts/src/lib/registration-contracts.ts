import { z } from 'zod';
import { isoTimestampSchema } from './common.js';
import { teamProgressStateSchema } from './event-state.js';

/**
 * Contract for the registration module:
 * - `POST /api/registration/teams`   — team leader registers a team (4–7 members incl. leader)
 * - `GET  /api/registration/teams/me` — the authenticated team's own registration
 *
 * Challenge track assignment is intentionally absent — it is blocked on
 * `docs/decisions/OPEN_QUESTIONS.md` question 1 and must not be invented.
 */

const PARTICIPANT_NAME_MAX = 100;
const TEAM_NAME_MIN = 3;
const TEAM_NAME_MAX = 60;
/** A team is 4–7 members total, including the leader. */
export const TEAM_MEMBERS_TOTAL_MIN = 4;
export const TEAM_MEMBERS_TOTAL_MAX = 7;
/** Password floor: deliberately slow hashes are pointless on short passwords. */
const PASSWORD_MIN = 12;

export const participantNameSchema = z.string().trim().min(1).max(PARTICIPANT_NAME_MAX);

export const teamMemberInputSchema = z.strictObject({
  name: participantNameSchema,
  email: z.email().optional(),
});

export const createTeamRequestSchema = z
  .strictObject({
    teamName: z.string().trim().min(TEAM_NAME_MIN).max(TEAM_NAME_MAX),
    leader: z.strictObject({
      name: participantNameSchema,
      email: z.email(),
      password: z.string().min(PASSWORD_MIN).max(256),
    }),
    members: z
      .array(teamMemberInputSchema)
      .min(TEAM_MEMBERS_TOTAL_MIN - 1)
      .max(TEAM_MEMBERS_TOTAL_MAX - 1),
  })
  .superRefine((request, context) => {
    // Every participant email that is provided must be unique within the team
    // (case-insensitive). Member emails are optional; absent ones never collide.
    const seen = new Set([request.leader.email.toLowerCase()]);
    request.members.forEach((member, index) => {
      if (!member.email) return;
      const email = member.email.toLowerCase();
      if (seen.has(email)) {
        context.addIssue({
          code: 'custom',
          path: ['members', index, 'email'],
          message: 'Each team participant must use a unique email address.',
        });
      }
      seen.add(email);
    });
  });

export type CreateTeamRequest = z.infer<typeof createTeamRequestSchema>;

export const participantSummarySchema = z.object({
  id: z.uuid(),
  name: participantNameSchema,
  isLeader: z.boolean(),
  /** Present once the participant has been checked in. */
  checkedInAt: isoTimestampSchema.optional(),
});

export type ParticipantSummary = z.infer<typeof participantSummarySchema>;

export const teamResponseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  progressState: teamProgressStateSchema,
  createdAt: isoTimestampSchema,
  leader: z.strictObject({
    id: z.uuid(),
    name: participantNameSchema,
  }),
  participants: z.array(participantSummarySchema),
});

export type TeamResponse = z.infer<typeof teamResponseSchema>;
export type MyTeamResponse = TeamResponse;
