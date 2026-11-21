import type {
  AdminResultsResponse,
  ChallengePosition,
  TeamChallengeScore,
  TeamResult,
  UpdateTeamScoresRequest,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import {
  jurorWeightedTotal,
  rankByTotal,
  resolveChallengeScore,
  resolveCtfPoints,
  roundScore,
} from './scoring';

/**
 * Results board (`GET /api/admin/results`) and administrator score overrides
 * (`PATCH /api/admin/teams/:teamId/scores`). Only active teams are ranked.
 *
 * Jurors write their own scores through the jury module; this service only
 * reads them. Overrides are stored on the team and audited.
 */

const POSITIONS: readonly ChallengePosition[] = [1, 2];

const teamScoreSelect = {
  id: true,
  name: true,
  ctfPoints: true,
  ctfPointsOverride: true,
  c1ScoreOverride: true,
  c2ScoreOverride: true,
  juryEvaluations: {
    select: {
      challengeId: true,
      technicalExecution: true,
      innovationOriginality: true,
      uiUxDesign: true,
      pitchPresentation: true,
    },
  },
} as const;

interface ChallengeRef {
  id: string;
  position: number;
  title: string;
}

interface TeamScoreRow {
  id: string;
  name: string;
  ctfPoints: number | null;
  ctfPointsOverride: number | null;
  c1ScoreOverride: number | null;
  c2ScoreOverride: number | null;
  juryEvaluations: Array<{
    challengeId: string;
    technicalExecution: number;
    innovationOriginality: number;
    uiUxDesign: number;
    pitchPresentation: number;
  }>;
}

function overrideFor(team: TeamScoreRow, position: ChallengePosition): number | null {
  return position === 1 ? team.c1ScoreOverride : team.c2ScoreOverride;
}

function toTeamResult(team: TeamScoreRow, challenges: readonly ChallengeRef[]) {
  const ctfPoints = resolveCtfPoints(team.ctfPoints, team.ctfPointsOverride);

  const challengeScores: TeamChallengeScore[] = POSITIONS.map((position) => {
    const challenge = challenges.find((item) => item.position === position) ?? null;
    const jurorTotals = challenge
      ? team.juryEvaluations
          .filter((evaluation) => evaluation.challengeId === challenge.id)
          .map(jurorWeightedTotal)
      : [];
    const override = overrideFor(team, position);
    const resolved = resolveChallengeScore(position, jurorTotals, override);

    return {
      position,
      challengeId: challenge?.id ?? null,
      challengeTitle: challenge?.title ?? null,
      juryAverage: resolved.juryAverage,
      jurorCount: jurorTotals.length,
      override,
      score: resolved.score,
      points: resolved.points,
    };
  });

  const total = roundScore(
    ctfPoints + challengeScores.reduce((sum, challenge) => sum + challenge.points, 0),
  );

  return {
    teamId: team.id,
    teamName: team.name,
    ctf: { automatic: team.ctfPoints, override: team.ctfPointsOverride, points: ctfPoints },
    challenges: challengeScores,
    total,
  };
}

async function loadChallenges(): Promise<ChallengeRef[]> {
  return getPrismaClient().challenge.findMany({
    where: { position: { in: [...POSITIONS] } },
    select: { id: true, position: true, title: true },
  });
}

export async function getAdminResults(): Promise<AdminResultsResponse> {
  const prisma = getPrismaClient();
  const [challenges, teams] = await Promise.all([
    loadChallenges(),
    prisma.team.findMany({ where: { status: 'active' }, select: teamScoreSelect }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    teams: rankByTotal(teams.map((team) => toTeamResult(team, challenges))),
  };
}

function describeChange(label: string, value: number | null | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value === null ? `${label} override cleared` : `${label} = ${value}`;
}

/**
 * Sets or clears the overrides named in the request; omitted fields stay as
 * they are. Returns the team's updated result, ranked against all teams.
 */
export async function updateTeamScores(
  teamId: string,
  request: UpdateTeamScoresRequest,
  adminUserId: string,
): Promise<TeamResult> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    await tx.team.update({
      where: { id: teamId },
      data: {
        ctfPointsOverride: request.ctfPoints,
        c1ScoreOverride: request.challenge1Score,
        c2ScoreOverride: request.challenge2Score,
      },
    });

    const summary = [
      describeChange('ctf', request.ctfPoints),
      describeChange('challenge 1', request.challenge1Score),
      describeChange('challenge 2', request.challenge2Score),
    ]
      .filter((part): part is string => part !== null)
      .join('; ');

    await recordAuditLog(
      {
        action: AuditAction.TeamScoresUpdated,
        actorId: adminUserId,
        targetType: 'team',
        targetId: teamId,
        summary,
      },
      tx,
    );
  });

  const results = await getAdminResults();
  const updated = results.teams.find((team) => team.teamId === teamId);
  if (updated) {
    return updated;
  }

  // A withdrawn or disqualified team is not ranked; report its scores unranked.
  const [challenges, team] = await Promise.all([
    loadChallenges(),
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: teamScoreSelect }),
  ]);
  return { ...toTeamResult(team, challenges), rank: results.teams.length + 1 };
}
