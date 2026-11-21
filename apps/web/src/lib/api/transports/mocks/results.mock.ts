import type { AdminResultsResponse, TeamResult, UpdateTeamScoresRequest } from 'api-contracts';
import { ApiClientError } from '../../errors';

/**
 * `GET /admin/results` and `PATCH /admin/teams/:id/scores` in mock mode.
 * Totals are recomputed here only so the UI can be exercised offline; the API
 * owns the real scoring rules.
 */

interface MockTeamScores {
  teamId: string;
  teamName: string;
  ctfAutomatic: number | null;
  ctfOverride: number | null;
  jury: [number | null, number | null];
  jurors: [number, number];
  overrides: [number | null, number | null];
}

const CHALLENGE_IDS = [
  '9b1c2f3e-0000-4000-8000-0000000000c1',
  '9b1c2f3e-0000-4000-8000-0000000000c2',
] as const;

const mockTeams: MockTeamScores[] = [
  {
    teamId: '7d1c2f3e-0000-4000-8000-000000000001',
    teamName: 'Sample Builders (Dev Mock)',
    ctfAutomatic: 7,
    ctfOverride: null,
    jury: [78.5, 82],
    jurors: [2, 2],
    overrides: [null, null],
  },
  {
    teamId: '7d1c2f3e-0000-4000-8000-000000000002',
    teamName: 'Night Owls (Dev Mock)',
    ctfAutomatic: 10,
    ctfOverride: null,
    jury: [64, 71.4],
    jurors: [2, 1],
    overrides: [null, null],
  },
  {
    teamId: '7d1c2f3e-0000-4000-8000-000000000003',
    teamName: 'Louage Crew (Dev Mock)',
    ctfAutomatic: null,
    ctfOverride: 4,
    jury: [null, null],
    jurors: [0, 0],
    overrides: [null, null],
  },
];

const WEIGHTS = [20, 70] as const;
const round = (value: number) => Math.round(value * 100) / 100;

function toResult(team: MockTeamScores): Omit<TeamResult, 'rank'> {
  const ctfPoints = team.ctfOverride ?? team.ctfAutomatic ?? 0;
  const challenges = ([0, 1] as const).map((index) => {
    const score = team.overrides[index] ?? team.jury[index] ?? 0;
    return {
      position: (index + 1) as 1 | 2,
      challengeId: CHALLENGE_IDS[index],
      challengeTitle: index === 0 ? 'Brand It Overnight' : 'Main challenge',
      juryAverage: team.jury[index],
      jurorCount: team.jurors[index],
      override: team.overrides[index],
      score,
      points: round((score * WEIGHTS[index]) / 100),
    };
  });
  return {
    teamId: team.teamId,
    teamName: team.teamName,
    ctf: { automatic: team.ctfAutomatic, override: team.ctfOverride, points: ctfPoints },
    challenges,
    total: round(ctfPoints + challenges[0].points + challenges[1].points),
  };
}

export function handleGetAdminResults(): AdminResultsResponse {
  const rows = mockTeams.map(toResult).sort((a, b) => b.total - a.total);
  return {
    generatedAt: new Date().toISOString(),
    teams: rows.map((row, index) => ({
      ...row,
      rank: index > 0 && rows[index - 1].total === row.total ? index : index + 1,
    })),
  };
}

export function handleUpdateTeamScores(teamId: string, body: UpdateTeamScoresRequest): TeamResult {
  const team = mockTeams.find((item) => item.teamId === teamId);
  if (!team) {
    throw new ApiClientError({ message: 'Team not found.', status: 404, code: 'NOT_FOUND' });
  }
  if (body.ctfPoints !== undefined) team.ctfOverride = body.ctfPoints;
  if (body.challenge1Score !== undefined) team.overrides[0] = body.challenge1Score;
  if (body.challenge2Score !== undefined) team.overrides[1] = body.challenge2Score;

  const updated = handleGetAdminResults().teams.find((item) => item.teamId === teamId);
  if (!updated) {
    throw new ApiClientError({ message: 'Team not found.', status: 404, code: 'NOT_FOUND' });
  }
  return updated;
}
