import { z } from 'zod';
import {
  Role,
  challengeTrackSchema,
  eventPhaseSchema,
  isoTimestampSchema,
  teamProgressStateSchema,
} from 'api-contracts';

/**
 * PROVISIONAL FRONTEND CONTRACTS (pending `libs/api-contracts` additions).
 *
 * These types mirror the planned endpoint groups in `docs/api/README.md` while
 * reusing all canonical enums (`Role`, `EventPhase`, `TeamProgressState`,
 * `ChallengeTrack`) from `libs/api-contracts`.
 *
 * Once backend modules implement their official contracts in `libs/api-contracts`,
 * replace imports here with `import ... from 'api-contracts'`.
 */

export const roleSchema = z.enum([Role.Team, Role.Jury, Role.Admin]);

export const eventStateResponseSchema = z.object({
  phase: eventPhaseSchema,
  /** Authoritative server UTC timestamp for countdown synchronization. */
  serverTime: isoTimestampSchema,
  nextPhase: eventPhaseSchema.nullable(),
  /** Server UTC timestamp when `nextPhase` begins, if scheduled. */
  nextPhaseAt: isoTimestampSchema.nullable(),
  /** Optional schedule window metadata from the event state service. */
  phaseLabel: z.string().optional(),
});

export type EventStateResponse = z.infer<typeof eventStateResponseSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  teamId: z.string().nullable().optional(),
  teamName: z.string().nullable().optional(),
  assignedTrack: challengeTrackSchema.nullable().optional(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  expiresAt: isoTimestampSchema.optional(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const sessionResponseSchema = z.object({
  user: authUserSchema.nullable(),
  serverTime: isoTimestampSchema,
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const teamMemberInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the participant full name (at least 2 characters).'),
  email: z.string().trim().email('Enter a valid email address.'),
});

export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>;

/**
 * Team leader registers a team of 3–5 participants (1 leader + 2–4 teammates).
 * Matches the team size rule in `README.md` and `AGENTS.md`.
 */
export const teamRegistrationRequestSchema = z.object({
  teamName: z
    .string()
    .trim()
    .min(2, 'Team name must be at least 2 characters.')
    .max(80, 'Team name must be 80 characters or fewer.'),
  leader: teamMemberInputSchema,
  teammates: z
    .array(teamMemberInputSchema)
    .min(2, 'Add at least 2 teammates (3–5 total participants including the leader).')
    .max(4, 'A team can have at most 4 teammates (5 total participants including the leader).'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export type TeamRegistrationRequest = z.infer<typeof teamRegistrationRequestSchema>;

export const teamRegistrationResponseSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  status: teamProgressStateSchema,
  participantCount: z.number().int().min(3).max(5),
  createdAt: isoTimestampSchema,
  message: z.string(),
});

export type TeamRegistrationResponse = z.infer<typeof teamRegistrationResponseSchema>;
