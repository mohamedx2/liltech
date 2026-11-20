import { z } from 'zod';
import {
  EventPhase,
  Role,
  challengeTrackSchema,
  eventStateResponseSchema as canonicalEventStateResponseSchema,
  isoTimestampSchema,
  participantPhoneSchema,
  participantUniversitySchema,
  TEAM_MEMBERS_TOTAL_MAX,
  TEAM_MEMBERS_TOTAL_MIN,
  teamProgressStateSchema,
  teamRegistrationResponseSchema as canonicalTeamRegistrationResponseSchema,
  resendBadgeEmailResponseSchema,
  teamBadgesResponseSchema,
  teamMemberProfileSchema,
  teamPortalSummarySchema,
  type ResendBadgeEmailResponse,
  type TeamBadgesResponse,
  type TeamMemberBadge,
  type TeamMemberProfile,
  type TeamPortalSummary,
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

/**
 * Web view of the canonical event-state contract (`libs/api-contracts`).
 * The backend stays the single source of truth for the wire shape; the derived
 * fields below exist only for rendering (phase stepper labels) and never gate
 * business rules.
 */
const EVENT_PHASE_ORDER: EventPhase[] = [
  EventPhase.Registration,
  EventPhase.Checkin,
  EventPhase.Live,
  EventPhase.SubmissionsClosed,
  EventPhase.Pitching,
  EventPhase.Results,
];

export const eventStateResponseSchema = canonicalEventStateResponseSchema.transform((state) => ({
  ...state,
  nextPhase: EVENT_PHASE_ORDER[EVENT_PHASE_ORDER.indexOf(state.phase) + 1] ?? null,
  nextPhaseAt: null,
  phaseLabel: undefined,
}));

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

export const loginResponseSchema = z.union([
  z.object({
    user: authUserSchema,
    token: z.string().optional(),
    expiresAt: isoTimestampSchema.optional(),
  }),
  z
    .object({
      account: z.object({
        id: z.string(),
        role: roleSchema,
        name: z.string(),
        email: z.string(),
      }),
      token: z.string(),
      expiresAt: isoTimestampSchema,
    })
    .transform((data) => ({
      user: {
        id: data.account.id,
        name: data.account.name,
        email: data.account.email,
        role: data.account.role,
      },
      token: data.token,
      expiresAt: data.expiresAt,
    })),
]);

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const sessionResponseSchema = z.union([
  z.object({
    user: authUserSchema.nullable(),
    /** Authoritative server time when the backend provides it; never fabricated client-side. */
    serverTime: isoTimestampSchema.optional(),
  }),
  z
    .object({
      id: z.string(),
      role: roleSchema,
      name: z.string(),
      email: z.string(),
    })
    .transform((data): { user: AuthUser; serverTime?: string } => ({
      user: {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
      },
    })),
]);

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const teamMemberInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the participant full name (at least 2 characters).'),
  email: z.string().trim().email('Enter a valid email address.'),
  university: participantUniversitySchema,
  phone: participantPhoneSchema,
});

export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>;

/**
 * Team leader registers a team of 4–7 participants (1 leader + 3–6 teammates).
 * Mirrors the canonical `createTeamRequestSchema` constraints in
 * `libs/api-contracts` (team size, team name 3–60 chars, password ≥ 12 chars) so client
 * validation matches what the server enforces.
 */
export const teamRegistrationRequestSchema = z.object({
  teamName: z
    .string()
    .trim()
    .min(3, 'Team name must be at least 3 characters.')
    .max(60, 'Team name must be 60 characters or fewer.'),
  leader: teamMemberInputSchema,
  teammates: z
    .array(teamMemberInputSchema)
    .min(
      TEAM_MEMBERS_TOTAL_MIN - 1,
      `Add at least ${TEAM_MEMBERS_TOTAL_MIN - 1} teammates (${TEAM_MEMBERS_TOTAL_MIN}–${TEAM_MEMBERS_TOTAL_MAX} total participants including the leader).`,
    )
    .max(
      TEAM_MEMBERS_TOTAL_MAX - 1,
      `A team can have at most ${TEAM_MEMBERS_TOTAL_MAX - 1} teammates (${TEAM_MEMBERS_TOTAL_MAX} total participants including the leader).`,
    ),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
});

export type TeamRegistrationRequest = z.infer<typeof teamRegistrationRequestSchema>;

/** One participant's QR badge, as issued at registration (raw token shown once). */
export const registeredBadgeSchema = z.object({
  participantId: z.string(),
  participantName: z.string(),
  token: z.string(),
});

export type RegisteredBadge = z.infer<typeof registeredBadgeSchema>;

export const teamRegistrationResponseSchema = z.union([
  /** Development mock shape. */
  z.object({
    teamId: z.string(),
    teamName: z.string(),
    status: teamProgressStateSchema,
    participantCount: z.number().int().min(TEAM_MEMBERS_TOTAL_MIN).max(TEAM_MEMBERS_TOTAL_MAX),
    createdAt: isoTimestampSchema,
    message: z.string().optional().default('Team registered successfully.'),
    badges: z.array(registeredBadgeSchema).optional().default([]),
  }),
  /**
   * The real backend returns the canonical team plus one QR badge per
   * participant (`libs/api-contracts`) — map it explicitly.
   */
  canonicalTeamRegistrationResponseSchema.transform((team) => ({
    teamId: team.id,
    teamName: team.name,
    status: team.progressState,
    participantCount: team.participants.length,
    createdAt: team.createdAt,
    message: 'Team registered successfully.',
    badges: team.badges.map(({ participantId, participantName, token }) => ({
      participantId,
      participantName,
      token,
    })),
  })),
]);

export type TeamRegistrationResponse = z.infer<typeof teamRegistrationResponseSchema>;

/**
 * Participant portal contracts (provisional — pending `libs/api-contracts` additions).
 * Reuse canonical enums (`TeamProgressState`, `ChallengeTrack`) from `api-contracts`.
 */

/**
 * Team portal contracts are canonical (`libs/api-contracts`): the team, its
 * members with badge colors, and every member's QR badge.
 */
export const participantProfileSchema = teamMemberProfileSchema;
export type ParticipantProfile = TeamMemberProfile;

export const teamSummarySchema = teamPortalSummarySchema;
export type TeamSummary = TeamPortalSummary;

export { teamBadgesResponseSchema, resendBadgeEmailResponseSchema };
export type { TeamBadgesResponse, TeamMemberBadge, ResendBadgeEmailResponse };

export const miniCtfStatusResponseSchema = z.object({
  /** Server-owned decision: gate availability (phase, check-in eligibility). */
  isOpen: z.boolean(),
  isSolved: z.boolean(),
  solvedAt: isoTimestampSchema.optional(),
  attemptsCount: z.number().int().nonnegative(),
  /** Server UTC timestamp until which further flag attempts are rejected. */
  cooldownUntil: isoTimestampSchema.nullable().optional(),
  hint: z.string().optional(),
});

export type MiniCtfStatusResponse = z.infer<typeof miniCtfStatusResponseSchema>;

export const miniCtfSubmitRequestSchema = z.object({
  flag: z.string().min(1, 'Flag cannot be empty').max(100),
});

export type MiniCtfSubmitRequest = z.infer<typeof miniCtfSubmitRequestSchema>;

export const miniCtfSubmitResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  progress: teamProgressStateSchema,
  unlockedChallengeTrack: challengeTrackSchema.nullable().optional(),
});

export type MiniCtfSubmitResponse = z.infer<typeof miniCtfSubmitResponseSchema>;

export const challengeResourceSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.string().optional(),
});

export type ChallengeResource = z.infer<typeof challengeResourceSchema>;

export const challengeDetailResponseSchema = z.object({
  id: z.string(),
  track: challengeTrackSchema,
  title: z.string(),
  description: z.string(),
  problemStatement: z.string(),
  deliverablesRequirements: z.array(z.string()),
  resources: z.array(challengeResourceSchema),
});

export type ChallengeDetailResponse = z.infer<typeof challengeDetailResponseSchema>;

export const submissionItemSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  track: challengeTrackSchema,
  title: z.string(),
  description: z.string().optional(),
  repoUrl: z.string().url().optional().or(z.literal('')),
  fileName: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  submittedAt: isoTimestampSchema,
  version: z.number().int().positive(),
});

export type SubmissionItem = z.infer<typeof submissionItemSchema>;

export const submissionHistoryResponseSchema = z.object({
  submissions: z.array(submissionItemSchema),
  current: submissionItemSchema.nullable().optional(),
  isLocked: z.boolean(),
  deadline: isoTimestampSchema.nullable().optional(),
});

export type SubmissionHistoryResponse = z.infer<typeof submissionHistoryResponseSchema>;

export const announcementPrioritySchema = z.enum(['normal', 'urgent', 'broadcast']);

export type AnnouncementPriority = z.infer<typeof announcementPrioritySchema>;

export const announcementItemSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    body: z.string().optional(),
    priority: announcementPrioritySchema.optional().default('normal'),
    createdAt: isoTimestampSchema.optional(),
    publishedAt: isoTimestampSchema.optional(),
    authorName: z.string().optional(),
  })
  .transform((item) => ({
    id: item.id,
    title: item.title ?? (item.authorName ? `Update by ${item.authorName}` : 'Announcement'),
    content: item.content ?? item.body ?? '',
    priority: item.priority ?? 'normal',
    createdAt: item.createdAt ?? item.publishedAt ?? new Date().toISOString(),
  }));

export type AnnouncementItem = z.infer<typeof announcementItemSchema>;

export const announcementsResponseSchema = z.object({
  items: z.array(announcementItemSchema),
  total: z.number().int().nonnegative(),
});

export type AnnouncementsResponse = z.infer<typeof announcementsResponseSchema>;

/**
 * Jury & Scoring portal contracts now live in `libs/api-contracts`
 * (`jury-contracts`); re-exported here so existing imports keep working.
 */
export {
  JURY_EVALUATION_CRITERIA,
  juryOverviewResponseSchema,
  juryTeamEvaluationResponseSchema,
  juryTeamItemSchema,
  submitEvaluationRequestSchema,
  submitEvaluationResponseSchema,
  type JuryCriterionKey,
  type JuryOverviewResponse,
  type JurySubmission,
  type JuryTeamEvaluationResponse,
  type JuryTeamItem,
  type SubmitEvaluationRequest,
  type SubmitEvaluationResponse,
} from 'api-contracts';
