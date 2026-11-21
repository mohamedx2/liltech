import {
  JURY_SCORING_PHASES,
  type ChallengeTrack,
  type EventPhase,
  type JuryEvaluation as JuryEvaluationView,
  type JuryOverviewResponse,
  type JurySubmission,
  type JuryTeamEvaluationResponse,
  type JuryTeamItem,
  type SubmitEvaluationRequest,
  type SubmitEvaluationResponse,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { getEventState } from '../event-state/event-state.service';
import { jurorWeightedTotal } from '../results/scoring';

/**
 * Jury evaluation (jury role only). Rules enforced here, never in the UI:
 * - a juror sees only the challenge an administrator assigned to them;
 * - they score every active team with at least one checked-in member;
 * - they read and write only their own scores;
 * - scores are saved only while submissions are closed or during the pitches;
 * - scores stay per juror (aggregation is an open question, nothing is summed).
 */

const SCORING_PHASES: ReadonlySet<EventPhase> = new Set(JURY_SCORING_PHASES);

/** Teams a jury evaluates: still competing and present at the venue. */
const ELIGIBLE_TEAM_WHERE = {
  status: 'active' as const,
  participants: { some: { checkIn: { isNot: null } } },
};

interface AssignedJury {
  jury: { id: string; name: string; email: string };
  challenge: { id: string; position: number; title: string; summary: string };
}

function trackFor(position: number): ChallengeTrack {
  return position === 1 ? 'track_a' : 'track_b';
}

function scoringOpen(phase: EventPhase): boolean {
  return SCORING_PHASES.has(phase);
}

async function loadAssignedJury(userId: string): Promise<AssignedJury> {
  const prisma = getPrismaClient();
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'jury' },
    select: {
      id: true,
      name: true,
      email: true,
      juryChallenge: { select: { id: true, position: true, title: true, summary: true } },
    },
  });

  if (!user) {
    throw ApiError.forbidden();
  }
  if (!user.juryChallenge) {
    throw ApiError.juryNotAssigned();
  }

  return {
    jury: { id: user.id, name: user.name, email: user.email },
    challenge: user.juryChallenge,
  };
}

async function loadTeams(assigned: AssignedJury, teamId?: string) {
  const prisma = getPrismaClient();

  return prisma.team.findMany({
    where: { ...ELIGIBLE_TEAM_WHERE, ...(teamId ? { id: teamId } : {}) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      progressState: true,
      _count: { select: { participants: true } },
      submissions: {
        where: { challengeId: assigned.challenge.id },
        orderBy: { submittedAt: 'desc' },
        select: {
          submittedAt: true,
          driveUrl: true,
          githubUrl: true,
          reportUrl: true,
          presentationUrl: true,
          commitSha: true,
        },
      },
      juryEvaluations: {
        where: { challengeId: assigned.challenge.id, juryUserId: assigned.jury.id },
        select: {
          technicalExecution: true,
          innovationOriginality: true,
          uiUxDesign: true,
          pitchPresentation: true,
          notes: true,
          updatedAt: true,
        },
      },
    },
  });
}

type TeamRow = Awaited<ReturnType<typeof loadTeams>>[number];

function toTeamItem(team: TeamRow, assigned: AssignedJury): JuryTeamItem {
  const latest = team.submissions[0];
  const evaluation = team.juryEvaluations[0];

  return {
    id: team.id,
    name: team.name,
    track: trackFor(assigned.challenge.position),
    progress: team.progressState,
    membersCount: team._count.participants,
    submitted: latest !== undefined,
    submittedAt: latest?.submittedAt.toISOString() ?? null,
    submissionTitle: latest ? assigned.challenge.title : null,
    submissionRepoUrl: latest ? (latest.githubUrl ?? latest.driveUrl) : null,
    submissionFileName: null,
    evaluationStatus: evaluation ? 'graded' : 'pending',
    myScore: evaluation ? jurorWeightedTotal(evaluation) : null,
    evaluatedAt: evaluation?.updatedAt.toISOString() ?? null,
  };
}

function toSubmission(team: TeamRow): JurySubmission | null {
  const latest = team.submissions[0];
  if (!latest) {
    return null;
  }
  return {
    submittedAt: latest.submittedAt.toISOString(),
    version: team.submissions.length,
    driveUrl: latest.driveUrl,
    githubUrl: latest.githubUrl,
    reportUrl: latest.reportUrl,
    presentationUrl: latest.presentationUrl,
    commitSha: latest.commitSha,
  };
}

function toEvaluation(team: TeamRow): JuryEvaluationView | null {
  const evaluation = team.juryEvaluations[0];
  if (!evaluation) {
    return null;
  }
  return {
    criteriaScores: {
      technical_execution: evaluation.technicalExecution,
      innovation_originality: evaluation.innovationOriginality,
      ui_ux_design: evaluation.uiUxDesign,
      pitch_presentation: evaluation.pitchPresentation,
    },
    notes: evaluation.notes,
    totalScore: jurorWeightedTotal(evaluation),
    evaluatedAt: evaluation.updatedAt.toISOString(),
  };
}

export async function getJuryOverview(userId: string): Promise<JuryOverviewResponse> {
  const assigned = await loadAssignedJury(userId);
  const [{ phase }, teams] = await Promise.all([getEventState(), loadTeams(assigned)]);
  const myTotals = teams.flatMap((team) => team.juryEvaluations.map(jurorWeightedTotal));

  return {
    track: trackFor(assigned.challenge.position),
    trackTitle: assigned.challenge.title,
    trackDescription: assigned.challenge.summary,
    assignedJury: assigned.jury,
    eventPhase: phase,
    totalTeams: teams.length,
    evaluatedTeams: myTotals.length,
    pendingTeams: teams.length - myTotals.length,
    averageScore: myTotals.length
      ? Math.round((myTotals.reduce((sum, total) => sum + total, 0) / myTotals.length) * 10) / 10
      : null,
    scoringOpen: scoringOpen(phase),
  };
}

export async function listJuryTeams(userId: string): Promise<JuryTeamItem[]> {
  const assigned = await loadAssignedJury(userId);
  const teams = await loadTeams(assigned);
  return teams.map((team) => toTeamItem(team, assigned));
}

async function loadEligibleTeam(assigned: AssignedJury, teamId: string): Promise<TeamRow> {
  const [team] = await loadTeams(assigned, teamId);
  if (!team) {
    // Withdrawn, absent or unknown teams are indistinguishable to the jury.
    throw ApiError.notFound('This team is not part of your evaluation.');
  }
  return team;
}

export async function getJuryTeamEvaluation(
  userId: string,
  teamId: string,
): Promise<JuryTeamEvaluationResponse> {
  const prisma = getPrismaClient();
  const assigned = await loadAssignedJury(userId);
  const [{ phase }, team] = await Promise.all([
    getEventState(),
    loadEligibleTeam(assigned, teamId),
  ]);
  const members = await prisma.participant.findMany({
    where: { teamId },
    orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, isLeader: true },
  });

  return {
    team: toTeamItem(team, assigned),
    members: members.map((member) => ({
      id: member.id,
      fullName: member.name,
      roleInTeam: member.isLeader ? 'leader' : 'member',
    })),
    submission: toSubmission(team),
    evaluation: toEvaluation(team),
    scoringOpen: scoringOpen(phase),
  };
}

export async function submitJuryEvaluation(
  userId: string,
  teamId: string,
  request: SubmitEvaluationRequest,
): Promise<SubmitEvaluationResponse> {
  const prisma = getPrismaClient();
  const assigned = await loadAssignedJury(userId);
  const { phase } = await getEventState();

  if (!scoringOpen(phase)) {
    throw ApiError.scoringClosed();
  }
  await loadEligibleTeam(assigned, teamId);

  const scores = {
    technicalExecution: request.criteriaScores.technical_execution,
    innovationOriginality: request.criteriaScores.innovation_originality,
    uiUxDesign: request.criteriaScores.ui_ux_design,
    pitchPresentation: request.criteriaScores.pitch_presentation,
  };
  // Stored as the raw sum (database CHECK); reported as the weighted total.
  const totalScore = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const weightedTotal = jurorWeightedTotal(scores);
  const notes = request.notes?.trim() ?? '';

  const saved = await prisma.$transaction(async (tx) => {
    const evaluation = await tx.juryEvaluation.upsert({
      where: {
        juryUserId_teamId_challengeId: {
          juryUserId: assigned.jury.id,
          teamId,
          challengeId: assigned.challenge.id,
        },
      },
      create: {
        juryUserId: assigned.jury.id,
        teamId,
        challengeId: assigned.challenge.id,
        ...scores,
        totalScore,
        notes,
      },
      update: { ...scores, totalScore, notes },
      select: { updatedAt: true },
    });

    // Scores are not logged: the audit records who scored which team, when.
    await recordAuditLog(
      {
        action: AuditAction.JuryEvaluationSaved,
        actorId: assigned.jury.id,
        targetType: 'team',
        targetId: teamId,
        summary: `Challenge ${assigned.challenge.position} evaluation saved`,
      },
      tx,
    );

    return evaluation;
  });

  return {
    success: true,
    teamId,
    totalScore: weightedTotal,
    evaluatedAt: saved.updatedAt.toISOString(),
    message: `Evaluation saved: ${weightedTotal} / 100.`,
  };
}
