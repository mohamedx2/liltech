import type { AdminCtfOverviewResponse, AdminCtfStage, AdminCtfTeam } from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { CTF_WINDOW_MINUTES } from '../ctf/ctf-scoring';
import { timingView } from '../ctf/ctf.service';
import { loadPhaseGate } from '../event-state/phase-gate';

/**
 * Read-only Mini-CTF situation board for administrators (`GET /api/admin/ctf`).
 *
 * Reports stage configuration and every team's progress. The answer digest is
 * read only to derive `answerConfigured`; neither the digest nor any answer
 * leaves this function.
 */
export async function getAdminCtfOverview(): Promise<AdminCtfOverviewResponse> {
  const prisma = getPrismaClient();

  const [gate, stageRows, solvedByStage, teamRows, progressRows, attemptsByTeam] =
    await Promise.all([
      loadPhaseGate(),
      prisma.ctfStage.findMany({
        orderBy: { position: 'asc' },
        select: {
          id: true,
          slug: true,
          position: true,
          title: true,
          status: true,
          answerHash: true,
          assetDriveUrl: true,
          requiredForUnlock: true,
          _count: { select: { hints: true, attempts: true } },
        },
      }),
      prisma.ctfProgress.groupBy({
        by: ['stageId'],
        where: { solvedAt: { not: null } },
        _count: { _all: true },
      }),
      prisma.team.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          progressState: true,
          ctfSolvedAt: true,
          ctfPoints: true,
          participants: {
            where: { checkIn: { isNot: null } },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.ctfProgress.findMany({
        select: {
          teamId: true,
          stageId: true,
          hintsUsed: true,
          solvedAt: true,
          updatedAt: true,
        },
      }),
      prisma.ctfAttempt.groupBy({
        by: ['teamId'],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

  const solvedCountByStage = new Map(solvedByStage.map((row) => [row.stageId, row._count._all]));

  const stages: AdminCtfStage[] = stageRows.map((stage) => ({
    slug: stage.slug,
    position: stage.position,
    title: stage.title,
    status: stage.status,
    answerConfigured: stage.answerHash !== null,
    hasDriveUrl: stage.assetDriveUrl !== null,
    requiredForUnlock: stage.requiredForUnlock,
    hintCount: stage._count.hints,
    solvedTeams: solvedCountByStage.get(stage.id) ?? 0,
    attempts: stage._count.attempts,
  }));

  const positionByStageId = new Map(stageRows.map((stage) => [stage.id, stage.position]));
  const attemptStatsByTeam = new Map(attemptsByTeam.map((row) => [row.teamId, row]));
  const progressByTeam = new Map<string, typeof progressRows>();
  for (const row of progressRows) {
    const rows = progressByTeam.get(row.teamId) ?? [];
    rows.push(row);
    progressByTeam.set(row.teamId, rows);
  }

  const teams: AdminCtfTeam[] = teamRows.map((team) => {
    const rows = progressByTeam.get(team.id) ?? [];
    const solvedPositions = new Set(
      rows
        .filter((row) => row.solvedAt !== null)
        .map((row) => positionByStageId.get(row.stageId))
        .filter((position): position is number => position !== undefined),
    );
    const started = rows.length > 0;
    const finished = team.ctfSolvedAt !== null;
    // The chain is sequential: the current stage is the first one not solved yet.
    const currentStage =
      started && !finished
        ? stageRows.find((stage) => !solvedPositions.has(stage.position))
        : undefined;
    const attemptStats = attemptStatsByTeam.get(team.id);
    const lastActivity = [
      attemptStats?._max.createdAt ?? null,
      ...rows.map((row) => row.updatedAt),
    ].reduce<Date | null>(
      (latest, value) => (value && (!latest || value > latest) ? value : latest),
      null,
    );

    return {
      teamId: team.id,
      teamName: team.name,
      standing: team.status,
      progressState: team.progressState,
      checkedIn: team.participants.length > 0,
      currentStagePosition: currentStage?.position ?? null,
      solvedStages: solvedPositions.size,
      attempts: attemptStats?._count._all ?? 0,
      hintsUsed: rows.reduce((total, row) => total + row.hintsUsed, 0),
      lastActivityAt: lastActivity?.toISOString() ?? null,
      chainSolvedAt: team.ctfSolvedAt?.toISOString() ?? null,
      points: team.ctfPoints,
    };
  });

  teams.sort(compareTeams);

  return {
    phase: gate.phase,
    timing: timingView(gate),
    windowMinutes: CTF_WINDOW_MINUTES,
    totals: {
      stages: stages.length,
      liveStages: stages.filter((stage) => stage.status === 'live').length,
      blockingStages: stages.filter(
        (stage) => stage.requiredForUnlock && (stage.status !== 'live' || !stage.answerConfigured),
      ).length,
      teams: teams.length,
      checkedInTeams: teams.filter((team) => team.checkedIn).length,
      // A team has started once it opened the chain (stage 1 unlocked) or finished it.
      startedTeams: teams.filter(
        (team) => team.currentStagePosition !== null || team.chainSolvedAt !== null,
      ).length,
      completedTeams: teams.filter((team) => team.chainSolvedAt !== null).length,
    },
    stages,
    teams,
  };
}

/** Finished teams first (fastest first), then by stages solved, then by name. */
function compareTeams(a: AdminCtfTeam, b: AdminCtfTeam): number {
  if (a.chainSolvedAt && b.chainSolvedAt) {
    return a.chainSolvedAt.localeCompare(b.chainSolvedAt);
  }
  if (a.chainSolvedAt) return -1;
  if (b.chainSolvedAt) return 1;
  if (a.solvedStages !== b.solvedStages) return b.solvedStages - a.solvedStages;
  return a.teamName.localeCompare(b.teamName);
}
