import { Prisma, type Challenge, type Submission } from '@prisma/client';
import {
  type ChallengeSubmissionState,
  type CreateSubmissionRequest,
  type SubmissionBlockedReason,
  type SubmissionItem,
  type SubmissionsOverviewResponse,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import {
  challengeAccessFor,
  toChallengeSchedule,
  type ChallengeUnlockContext,
} from '../challenges/challenges.service';
import { loadPhaseGate, type ParticipantPhaseGate } from '../event-state/phase-gate';
import { fetchGithubHeadCommit } from './github-commit';

/**
 * Team submissions.
 *
 * Every rule lives here, on the server:
 * - the team is resolved from the authenticated account (never from the body);
 * - the event must be `live` (phase gate);
 * - the challenge must be readable for this team (Mini-CTF, fallback, force-open
 *   or administrator start, decided by the challenges module);
 * - an organizer deadline and the challenge end are enforced;
 * - history is append-only and the newest row is the one that counts.
 *
 * There is no file upload: Challenge 01 is one Google Drive link, Challenge 02
 * is a GitHub repository plus a report link and a presentation link.
 */

/**
 * Legacy progress states that mean the Mini-CTF chain is finished. The
 * authoritative signal is `Team.ctfSolvedAt`; `submitted` is only a deliverable
 * state (a fallback Challenge 01 submission sets it) and never implies a solve.
 */
const CHAIN_COMPLETED_STATES: ReadonlySet<string> = new Set(['challenge_unlocked']);

interface TeamForSubmissions {
  id: string;
  status: string;
  progressState: string;
  ctfSolvedAt: Date | null;
  ctfSolveChallengeIds: Set<string>;
}

async function requireTeam(userId: string): Promise<{
  team: TeamForSubmissions;
  gate: ParticipantPhaseGate;
}> {
  const prisma = getPrismaClient();
  const team = await prisma.team.findUnique({
    where: { leaderId: userId },
    select: {
      id: true,
      status: true,
      progressState: true,
      ctfSolvedAt: true,
      ctfSolves: { select: { challengeId: true } },
      participants: { where: { checkIn: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });

  if (!team) {
    throw ApiError.notFound('No registered team found for this account.');
  }
  if (team.status !== 'active') {
    throw ApiError.forbidden(
      `Your team is ${team.status} and cannot submit deliverables. Please contact the organizers.`,
    );
  }
  // Only teams present at the venue take part (same rule as the challenges).
  if (team.participants.length === 0) {
    throw ApiError.forbidden(
      'Your team has not been checked in yet. Show your QR codes at the entrance to take part.',
    );
  }

  return {
    team: {
      id: team.id,
      status: team.status,
      progressState: team.progressState,
      ctfSolvedAt: team.ctfSolvedAt,
      ctfSolveChallengeIds: new Set(team.ctfSolves.map((solve) => solve.challengeId)),
    },
    gate: await loadPhaseGate(),
  };
}

function teamSolvedChain(team: TeamForSubmissions): boolean {
  return team.ctfSolvedAt !== null || CHAIN_COMPLETED_STATES.has(team.progressState);
}

function unlockContextFor(
  team: TeamForSubmissions,
  challenge: Challenge,
  gate: ParticipantPhaseGate,
): ChallengeUnlockContext {
  return {
    gate,
    ctfSolved: teamSolvedChain(team) || team.ctfSolveChallengeIds.has(challenge.id),
    now: gate.serverTime,
  };
}

/** Why a team cannot submit now, or null when it can. */
export function submissionBlockedReasonFor(
  challenge: Pick<Challenge, 'status' | 'submissionDeadline'>,
  access: 'locked' | 'early' | 'public',
  gate: ParticipantPhaseGate,
): SubmissionBlockedReason | null {
  if (!gate.eventLive) {
    return gate.phase === 'registration' || gate.phase === 'checkin'
      ? 'EVENT_NOT_LIVE'
      : 'SUBMISSIONS_CLOSED';
  }
  if (challenge.status === 'upcoming') {
    return 'CHALLENGE_NOT_STARTED';
  }
  if (access === 'locked') {
    return 'CHALLENGE_LOCKED';
  }
  if (challenge.status === 'ended') {
    return 'SUBMISSIONS_CLOSED';
  }
  if (
    challenge.submissionDeadline &&
    challenge.submissionDeadline.getTime() <= gate.serverTime.getTime()
  ) {
    return 'DEADLINE_PASSED';
  }
  return null;
}

const BLOCKED_MESSAGES: Record<SubmissionBlockedReason, string> = {
  EVENT_NOT_LIVE: 'Submissions open when the event goes live.',
  SUBMISSIONS_CLOSED: 'Submissions are closed for this challenge.',
  CHALLENGE_NOT_STARTED: 'This challenge has not started yet.',
  CHALLENGE_LOCKED: 'This challenge is not open for your team yet.',
  DEADLINE_PASSED: 'The submission deadline has passed. The last submission counts.',
};

function blockedError(reason: SubmissionBlockedReason): ApiError {
  const message = BLOCKED_MESSAGES[reason];

  if (reason === 'CHALLENGE_LOCKED' || reason === 'CHALLENGE_NOT_STARTED') {
    return ApiError.challengeLocked(message);
  }

  return ApiError.submissionsClosed(message);
}

function toSubmissionItem(
  submission: Submission,
  challengePosition: number,
  isCurrent: boolean,
): SubmissionItem {
  return {
    id: submission.id,
    challengeId: submission.challengeId,
    challengePosition,
    driveUrl: submission.driveUrl,
    githubUrl: submission.githubUrl,
    reportUrl: submission.reportUrl,
    presentationUrl: submission.presentationUrl,
    commitSha: submission.commitSha,
    submittedAt: submission.submittedAt.toISOString(),
    isCurrent,
  };
}

async function loadChallengesWithHistory(teamId: string): Promise<
  {
    challenge: Challenge;
    history: Submission[];
  }[]
> {
  const prisma = getPrismaClient();
  const challenges = await prisma.challenge.findMany({ orderBy: { position: 'asc' } });
  const submissions = await prisma.submission.findMany({
    where: { teamId },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
  });

  return challenges.map((challenge) => ({
    challenge,
    history: submissions.filter((submission) => submission.challengeId === challenge.id),
  }));
}

export async function listSubmissionsForTeam(userId: string): Promise<SubmissionsOverviewResponse> {
  const { team, gate } = await requireTeam(userId);
  const rows = await loadChallengesWithHistory(team.id);

  const items: ChallengeSubmissionState[] = rows.map(({ challenge, history }) => {
    const access = challengeAccessFor(challenge, unlockContextFor(team, challenge, gate));
    const blockedReason = submissionBlockedReasonFor(challenge, access, gate);
    const mapped = history.map((submission, index) =>
      toSubmissionItem(submission, challenge.position, index === 0),
    );

    return {
      challenge: toChallengeSchedule(challenge),
      access,
      canSubmit: blockedReason === null,
      blockedReason,
      current: mapped[0] ?? null,
      history: mapped,
    };
  });

  return {
    phase: gate.phase,
    serverTime: gate.serverTime.toISOString(),
    items,
  };
}

export async function createSubmission(
  userId: string,
  request: CreateSubmissionRequest,
): Promise<SubmissionItem> {
  const prisma = getPrismaClient();
  const { team, gate } = await requireTeam(userId);

  const challenge = await prisma.challenge.findUnique({
    where: { position: request.challengePosition },
  });
  if (!challenge) {
    throw ApiError.notFound('That challenge does not exist yet.');
  }

  const access = challengeAccessFor(challenge, unlockContextFor(team, challenge, gate));
  const blockedReason = submissionBlockedReasonFor(challenge, access, gate);
  if (blockedReason) {
    throw blockedError(blockedReason);
  }

  const commitSha =
    request.challengePosition === 2 ? await fetchGithubHeadCommit(request.githubUrl) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          teamId: team.id,
          challengeId: challenge.id,
          submittedByUserId: userId,
          driveUrl: request.challengePosition === 1 ? request.driveUrl : null,
          githubUrl: request.challengePosition === 2 ? request.githubUrl : null,
          reportUrl: request.challengePosition === 2 ? request.reportUrl : null,
          presentationUrl: request.challengePosition === 2 ? request.presentationUrl : null,
          commitSha,
        },
      });

      await tx.team.updateMany({
        where: { id: team.id, progressState: { not: 'submitted' } },
        data: { progressState: 'submitted' },
      });

      await recordAuditLog(
        {
          action: AuditAction.SubmissionCreated,
          actorId: userId,
          targetType: 'challenge',
          targetId: challenge.id,
          summary: `submission for challenge ${challenge.position}`,
        },
        tx,
      );

      return toSubmissionItem(created, challenge.position, true);
    });
  } catch (error) {
    // The append-only insert has no natural unique key; anything unexpected is
    // surfaced as a conflict rather than a silent success.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw ApiError.conflict('The submission could not be recorded. Please retry.');
    }
    throw error;
  }
}
