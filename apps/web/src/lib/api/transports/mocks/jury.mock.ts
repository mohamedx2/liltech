import { ChallengeTrack, Role } from 'api-contracts';
import type {
  JuryOverviewResponse,
  JuryTeamEvaluationResponse,
  JuryTeamItem,
  SubmitEvaluationRequest,
  SubmitEvaluationResponse,
} from '../../contracts/pending';
import { ApiClientError } from '../../errors';
import { DEV_MOCK_USERS, devMockState } from './dev-state';

function getActiveJuryUser() {
  const current = devMockState.currentUser;
  if (current && current.role === Role.Jury) {
    return current;
  }
  const fallback = DEV_MOCK_USERS.find((u) => u.role === Role.Jury);
  if (!fallback) {
    throw new ApiClientError({
      message: 'No active jury user configured in mock state.',
      status: 401,
      code: 'UNAUTHORIZED',
    });
  }
  return fallback;
}

export function handleGetJuryOverview(): JuryOverviewResponse {
  const juryUser = getActiveJuryUser();
  const assignedTrack = juryUser.assignedTrack ?? ChallengeTrack.TrackA;

  const trackTeams = devMockState.juryTeams.filter((t) => t.track === assignedTrack);
  const totalTeams = trackTeams.length;

  let totalScoreSum = 0;
  let evaluatedCount = 0;

  for (const team of trackTeams) {
    const evaluation = devMockState.juryEvaluations.get(team.id);
    if (evaluation) {
      evaluatedCount += 1;
      totalScoreSum += evaluation.totalScore;
    }
  }

  const pendingTeams = Math.max(0, totalTeams - evaluatedCount);
  const averageScore =
    evaluatedCount > 0 ? Math.round((totalScoreSum / evaluatedCount) * 10) / 10 : null;

  const isTrackA = assignedTrack === ChallengeTrack.TrackA;

  return {
    track: assignedTrack,
    trackTitle: isTrackA
      ? 'Track A — Autonomous AI Logistics Dispatcher'
      : 'Track B — Edge IoT Intelligent Sensor Network',
    trackDescription: isTrackA
      ? 'Design and implement an autonomous real-time routing engine optimizing multi-agent vehicle dispatch under live dynamic constraints.'
      : 'Develop low-latency, resilient edge microservices connecting IoT hardware sensors with cloud processing.',
    assignedJury: {
      id: juryUser.id,
      name: juryUser.name,
      email: juryUser.email,
    },
    eventPhase: devMockState.phase,
    totalTeams,
    evaluatedTeams: evaluatedCount,
    pendingTeams,
    averageScore,
    scoringOpen: true,
  };
}

export function handleGetJuryTeams(): JuryTeamItem[] {
  const juryUser = getActiveJuryUser();
  const assignedTrack = juryUser.assignedTrack ?? ChallengeTrack.TrackA;

  // Strict challenge isolation: jury member may only access their assigned track (AGENTS.md §7)
  const trackTeams = devMockState.juryTeams.filter((t) => t.track === assignedTrack);

  return trackTeams.map((team) => {
    const evaluation = devMockState.juryEvaluations.get(team.id);
    return {
      ...team,
      evaluationStatus: evaluation ? ('graded' as const) : ('pending' as const),
      myScore: evaluation ? evaluation.totalScore : null,
      evaluatedAt: evaluation ? evaluation.evaluatedAt : null,
    };
  });
}

export function handleGetJuryEvaluation(teamId: string): JuryTeamEvaluationResponse {
  const juryUser = getActiveJuryUser();
  const assignedTrack = juryUser.assignedTrack ?? ChallengeTrack.TrackA;

  const team = devMockState.juryTeams.find((t) => t.id === teamId);
  if (!team) {
    throw new ApiClientError({
      message: `Team '${teamId}' was not found.`,
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  // Strict track isolation check
  if (team.track !== assignedTrack) {
    throw new ApiClientError({
      message: 'Access restricted: this team belongs to a different challenge track.',
      status: 403,
      code: 'FORBIDDEN',
    });
  }

  const evaluation = devMockState.juryEvaluations.get(teamId);

  return {
    team: {
      ...team,
      evaluationStatus: evaluation ? 'graded' : 'pending',
      myScore: evaluation?.totalScore ?? null,
      evaluatedAt: evaluation?.evaluatedAt ?? null,
    },
    members: [
      { id: `${team.id}-m1`, fullName: 'Team Lead & Architect', roleInTeam: 'leader' },
      { id: `${team.id}-m2`, fullName: 'Algorithm Engineer', roleInTeam: 'member' },
      { id: `${team.id}-m3`, fullName: 'Frontend & UI Developer', roleInTeam: 'member' },
    ],
    submission: team.submitted
      ? {
          submittedAt: team.submittedAt ?? '2026-11-21T21:15:00.000Z',
          version: 1,
          driveUrl: 'https://drive.google.com/drive/folders/demo-deliverables',
          githubUrl: team.submissionRepoUrl ?? 'https://github.com/liltech/sample-repo',
          reportUrl: 'https://docs.google.com/document/d/demo-report',
          presentationUrl: 'https://docs.google.com/presentation/d/demo-pitch',
          commitSha: null,
        }
      : null,
    evaluation: evaluation
      ? {
          criteriaScores: evaluation.criteriaScores,
          notes: evaluation.notes,
          totalScore: evaluation.totalScore,
          evaluatedAt: evaluation.evaluatedAt,
        }
      : null,
    scoringOpen: true,
  };
}

export function handleSubmitJuryEvaluation(
  teamId: string,
  payload: SubmitEvaluationRequest,
): SubmitEvaluationResponse {
  const juryUser = getActiveJuryUser();
  const assignedTrack = juryUser.assignedTrack ?? ChallengeTrack.TrackA;

  const team = devMockState.juryTeams.find((t) => t.id === teamId);
  if (!team) {
    throw new ApiClientError({
      message: `Team '${teamId}' was not found.`,
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  if (team.track !== assignedTrack) {
    throw new ApiClientError({
      message: 'Access restricted: you cannot grade teams in another challenge track.',
      status: 403,
      code: 'FORBIDDEN',
    });
  }

  const scores = payload.criteriaScores;
  const totalScore =
    (scores.technical_execution ?? 0) +
    (scores.innovation_originality ?? 0) +
    (scores.ui_ux_design ?? 0) +
    (scores.pitch_presentation ?? 0);

  const evaluatedAt = new Date().toISOString();

  devMockState.juryEvaluations.set(teamId, {
    criteriaScores: scores,
    notes: payload.notes ?? '',
    totalScore,
    evaluatedAt,
  });

  // Update team record
  const teamIndex = devMockState.juryTeams.findIndex((t) => t.id === teamId);
  if (teamIndex !== -1) {
    devMockState.juryTeams[teamIndex] = {
      ...devMockState.juryTeams[teamIndex],
      evaluationStatus: 'graded',
      myScore: totalScore,
      evaluatedAt,
    };
  }

  return {
    success: true,
    teamId,
    totalScore,
    evaluatedAt,
    message: 'Team evaluation submitted successfully.',
  };
}
