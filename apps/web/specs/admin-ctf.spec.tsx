import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { AdminCtfOverviewResponse, AdminCtfStage, AdminCtfTeam } from 'api-contracts';
import { AdminCtfView } from '@/features/admin/admin-ctf-view';
import { api, ApiClientError } from '@/lib/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/ctf',
}));

function stage(position: number, overrides: Partial<AdminCtfStage> = {}): AdminCtfStage {
  return {
    slug: `louage-404-0${position}`,
    position,
    title: `Stage ${position}`,
    status: 'live',
    answerConfigured: true,
    hasDriveUrl: true,
    requiredForUnlock: true,
    hintCount: 3,
    solvedTeams: 0,
    attempts: 0,
    ...overrides,
  };
}

function team(overrides: Partial<AdminCtfTeam> & { teamId: string; teamName: string }) {
  return {
    standing: 'active',
    progressState: 'checked_in',
    checkedIn: true,
    currentStagePosition: null,
    solvedStages: 0,
    attempts: 0,
    hintsUsed: 0,
    lastActivityAt: null,
    chainSolvedAt: null,
    points: null,
    ...overrides,
  } satisfies AdminCtfTeam;
}

function board(overrides: Partial<AdminCtfOverviewResponse> = {}): AdminCtfOverviewResponse {
  const now = Date.now();
  return {
    phase: 'live',
    timing: {
      startedAt: new Date(now - 20 * 60_000).toISOString(),
      closesAt: new Date(now + 40 * 60_000).toISOString(),
      open: true,
      closed: false,
      serverTime: new Date(now).toISOString(),
    },
    windowMinutes: 60,
    totals: {
      stages: 3,
      liveStages: 3,
      blockingStages: 0,
      teams: 2,
      checkedInTeams: 2,
      startedTeams: 2,
      completedTeams: 1,
    },
    stages: [stage(1, { solvedTeams: 2, attempts: 5 }), stage(2), stage(3)],
    teams: [
      team({
        teamId: '00000000-0000-4000-8000-000000000001',
        teamName: 'Quantum Coders',
        solvedStages: 3,
        chainSolvedAt: new Date(now - 8 * 60_000).toISOString(),
        points: 10,
      }),
      team({
        teamId: '00000000-0000-4000-8000-000000000002',
        teamName: 'Algorithmic Titans',
        currentStagePosition: 2,
        solvedStages: 1,
        attempts: 3,
      }),
    ],
    ...overrides,
  };
}

describe('AdminCtfView', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the open clock, every stage and each team with a link to its page', async () => {
    vi.spyOn(api.admin, 'getCtfOverview').mockResolvedValue(board());

    render(<AdminCtfView />);

    expect(await screen.findByRole('heading', { name: 'Mini-CTF' })).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Every required stage is live with an answer.')).toBeTruthy();
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeTruthy();

    const stages = screen.getByRole('table', { name: /LOUAGE 404 stages/ });
    expect(within(stages).getAllByText('Configured')).toHaveLength(3);

    const teams = screen.getByRole('table', { name: /Teams by Mini-CTF progress/ });
    expect(within(teams).getByText('Finished')).toBeTruthy();
    expect(within(teams).getByText('10 pts')).toBeTruthy();
    expect(within(teams).getByText('Stage 2/3')).toBeTruthy();
    expect(
      within(teams).getByRole('link', { name: 'Algorithmic Titans' }).getAttribute('href'),
    ).toBe('/admin/teams/00000000-0000-4000-8000-000000000002');
  });

  it('warns that draft stages block the chain and that the event is not live', async () => {
    vi.spyOn(api.admin, 'getCtfOverview').mockResolvedValue(
      board({
        phase: 'checkin',
        timing: {
          startedAt: null,
          closesAt: null,
          open: false,
          closed: false,
          serverTime: new Date().toISOString(),
        },
        stages: [stage(1), stage(2, { status: 'draft', answerConfigured: false }), stage(3)],
        teams: [],
      }),
    );

    render(<AdminCtfView />);

    expect(await screen.findByText(/every team stops at stage 2/)).toBeTruthy();
    expect(screen.getByText('Not launched')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the Control Panel' })).toBeTruthy();
    expect(screen.getByText('Missing')).toBeTruthy();
    expect(screen.getByText('No team registered')).toBeTruthy();
  });

  it('offers a retry when the board cannot load', async () => {
    vi.spyOn(api.admin, 'getCtfOverview').mockRejectedValue(
      new ApiClientError({ message: 'Server unavailable', status: 503, code: 'UNAVAILABLE' }),
    );

    render(<AdminCtfView />);

    expect(await screen.findByText('Mini-CTF Board Unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
