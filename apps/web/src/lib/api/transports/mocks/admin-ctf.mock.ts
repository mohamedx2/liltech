import type { AdminCtfOverviewResponse, AdminCtfStage, AdminCtfTeam } from 'api-contracts';
import { devMockState } from './dev-state';

/**
 * `GET /admin/ctf` in mock mode. Configuration mirrors a realistic event night:
 * some stages still in draft, a few teams at different points of the chain.
 * No answers or digests exist in the mock either — only `answerConfigured`.
 */

const WINDOW_MINUTES = 60;
const MINUTE = 60_000;

const STAGES: AdminCtfStage[] = [
  { position: 1, status: 'live', answerConfigured: true, hasDriveUrl: true, solved: 3, tries: 9 },
  { position: 2, status: 'draft', answerConfigured: false, hasDriveUrl: true, solved: 0, tries: 0 },
  { position: 3, status: 'live', answerConfigured: true, hasDriveUrl: true, solved: 0, tries: 0 },
  { position: 4, status: 'live', answerConfigured: true, hasDriveUrl: true, solved: 0, tries: 0 },
  { position: 5, status: 'live', answerConfigured: true, hasDriveUrl: false, solved: 0, tries: 0 },
  {
    position: 6,
    status: 'draft',
    answerConfigured: false,
    hasDriveUrl: false,
    solved: 0,
    tries: 0,
  },
  { position: 7, status: 'draft', answerConfigured: false, hasDriveUrl: true, solved: 0, tries: 0 },
].map(({ position, status, answerConfigured, hasDriveUrl, solved, tries }) => ({
  slug: `louage-404-0${position}`,
  position,
  title: `LOUAGE 404 — stage ${position}`,
  status: status as AdminCtfStage['status'],
  answerConfigured,
  hasDriveUrl,
  requiredForUnlock: true,
  hintCount: 3,
  solvedTeams: solved,
  attempts: tries,
}));

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

function buildTeams(): AdminCtfTeam[] {
  const base = {
    standing: 'active' as const,
    checkedIn: true,
    chainSolvedAt: null,
    points: null,
  };
  return [
    {
      ...base,
      teamId: '7d1c2f3e-0000-4000-8000-000000000001',
      teamName: 'Sample Builders (Dev Mock)',
      progressState: 'ctf_unlocked',
      currentStagePosition: 2,
      solvedStages: 1,
      attempts: 4,
      hintsUsed: 2,
      lastActivityAt: minutesAgo(2),
    },
    {
      ...base,
      teamId: '7d1c2f3e-0000-4000-8000-000000000002',
      teamName: 'Quantum Coders',
      progressState: 'ctf_unlocked',
      currentStagePosition: 2,
      solvedStages: 1,
      attempts: 3,
      hintsUsed: 0,
      lastActivityAt: minutesAgo(6),
    },
    {
      ...base,
      teamId: '7d1c2f3e-0000-4000-8000-000000000003',
      teamName: 'Algorithmic Titans',
      progressState: 'ctf_unlocked',
      currentStagePosition: 2,
      solvedStages: 1,
      attempts: 2,
      hintsUsed: 1,
      lastActivityAt: minutesAgo(11),
    },
    {
      ...base,
      teamId: '7d1c2f3e-0000-4000-8000-000000000004',
      teamName: 'DeepRoute Innovators',
      progressState: 'checked_in',
      currentStagePosition: 1,
      solvedStages: 0,
      attempts: 0,
      hintsUsed: 0,
      lastActivityAt: minutesAgo(14),
    },
    {
      ...base,
      teamId: '7d1c2f3e-0000-4000-8000-000000000005',
      teamName: 'Late Louage',
      progressState: 'registered',
      checkedIn: false,
      currentStagePosition: null,
      solvedStages: 0,
      attempts: 0,
      hintsUsed: 0,
      lastActivityAt: null,
    },
  ];
}

export function handleGetAdminCtf(): AdminCtfOverviewResponse {
  const live = devMockState.phase === 'live';
  const now = Date.now();
  // In mock mode the launch is the moment the mock event went live.
  const startedAt = live
    ? Math.min(now - 18 * MINUTE, Date.parse(devMockState.phaseChangedAt))
    : null;
  const closesAt = startedAt === null ? null : startedAt + WINDOW_MINUTES * MINUTE;
  const open = closesAt !== null && now < closesAt;
  const teams = live
    ? buildTeams()
    : buildTeams().map((team) => ({
        ...team,
        currentStagePosition: null,
        solvedStages: 0,
        attempts: 0,
        hintsUsed: 0,
        lastActivityAt: null,
      }));
  const stages = live ? STAGES : STAGES.map((stage) => ({ ...stage, solvedTeams: 0, attempts: 0 }));

  return {
    phase: devMockState.phase,
    timing: {
      startedAt: startedAt === null ? null : new Date(startedAt).toISOString(),
      closesAt: closesAt === null ? null : new Date(closesAt).toISOString(),
      open,
      closed: startedAt !== null && !open,
      serverTime: new Date(now).toISOString(),
    },
    windowMinutes: WINDOW_MINUTES,
    totals: {
      stages: stages.length,
      liveStages: stages.filter((stage) => stage.status === 'live').length,
      blockingStages: stages.filter(
        (stage) => stage.requiredForUnlock && (stage.status !== 'live' || !stage.answerConfigured),
      ).length,
      teams: teams.length,
      checkedInTeams: teams.filter((team) => team.checkedIn).length,
      startedTeams: teams.filter((team) => team.currentStagePosition !== null).length,
      completedTeams: teams.filter((team) => team.chainSolvedAt !== null).length,
    },
    stages,
    teams,
  };
}
