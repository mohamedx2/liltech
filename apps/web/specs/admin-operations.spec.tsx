import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  EventPhase,
  type AdminOverviewResponse,
  type AdminParticipant,
  type AdminTeam,
} from 'api-contracts';
import {
  AdminTeamsView,
  matchesFilter,
  matchesSearch,
  rosterToCsv,
} from '@/features/admin/admin-teams-view';
import { AdminTeamDetailView } from '@/features/admin/admin-team-detail-view';
import { AdminDashboardView } from '@/features/admin/admin-dashboard-view';
import { parseResources } from '@/features/admin/admin-challenges-view';
import { api } from '@/lib/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin',
}));

const TEAM_ID = '00000000-0000-4000-8000-0000000000aa';

function participant(overrides: Partial<AdminParticipant> & { id: string; name: string }) {
  return {
    isLeader: false,
    email: `${overrides.name.toLowerCase().replaceAll(' ', '.')}@example.test`,
    color: 'blue',
    checkedInAt: null,
    checkedInByName: null,
    paidAt: null,
    paidByName: null,
    badge: {
      issuedAt: '2026-11-20T10:00:00.000Z',
      revokedAt: null,
      emailStatus: 'sent',
      emailLastSentAt: '2026-11-20T10:00:00.000Z',
    },
    ...overrides,
  } satisfies AdminParticipant;
}

function makeTeam(overrides: Partial<AdminTeam> = {}): AdminTeam {
  return {
    id: TEAM_ID,
    name: 'Quantum Coders',
    progressState: 'registered',
    status: 'active',
    statusReason: null,
    statusChangedAt: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    leader: {
      id: '00000000-0000-4000-8000-0000000000b0',
      name: 'Sarra Leader',
      email: 'sarra.leader@example.test',
    },
    participants: [
      participant({
        id: '00000000-0000-4000-8000-0000000000b1',
        name: 'Sarra Leader',
        isLeader: true,
      }),
      participant({ id: '00000000-0000-4000-8000-0000000000b2', name: 'Karim Member' }),
      participant({ id: '00000000-0000-4000-8000-0000000000b3', name: 'Amira Member' }),
      participant({ id: '00000000-0000-4000-8000-0000000000b4', name: 'Youssef Member' }),
    ],
    ctfSolves: [],
    ...overrides,
  };
}

const EVENT_STATE = {
  phase: EventPhase.Checkin,
  serverTime: '2026-11-21T18:00:00.000Z',
  nextPhase: EventPhase.Live,
  nextPhaseAt: '2026-11-21T19:00:00.000Z',
  phaseLabel: 'Checkin Open',
};

describe('admin operations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('roster helpers', () => {
    const team = makeTeam();
    const partial = makeTeam({
      participants: team.participants.map((p, index) =>
        index === 0 ? { ...p, checkedInAt: '2026-11-21T18:00:00.000Z' } : p,
      ),
    });

    it('filters teams by check-in coverage and problems', () => {
      expect(matchesFilter(team, 'not-checked-in')).toBe(true);
      expect(matchesFilter(partial, 'partial')).toBe(true);
      expect(matchesFilter(partial, 'not-checked-in')).toBe(false);
      expect(matchesFilter(team, 'email-problem')).toBe(false);

      const failed = makeTeam({
        participants: team.participants.map((p, index) =>
          index === 1 && p.badge ? { ...p, badge: { ...p.badge, emailStatus: 'failed' } } : p,
        ),
      });
      expect(matchesFilter(failed, 'email-problem')).toBe(true);
      expect(matchesFilter(makeTeam({ status: 'withdrawn' }), 'inactive')).toBe(true);
      expect(matchesFilter(team, 'unpaid')).toBe(true);
      const allPaid = makeTeam({
        participants: team.participants.map((p) => ({
          ...p,
          paidAt: '2026-11-21T17:00:00.000Z',
          paidByName: 'Ops',
        })),
      });
      expect(matchesFilter(allPaid, 'unpaid')).toBe(false);
      expect(
        matchesFilter(makeTeam({ participants: team.participants.slice(0, 3) }), 'needs-members'),
      ).toBe(true);
    });

    it('searches team names, participant names and emails', () => {
      expect(matchesSearch(team, 'quantum')).toBe(true);
      expect(matchesSearch(team, 'karim')).toBe(true);
      expect(matchesSearch(team, 'amira.member@')).toBe(true);
      expect(matchesSearch(team, 'nobody')).toBe(false);
    });

    it('exports one CSV row per participant and neutralizes formulas', () => {
      const csv = rosterToCsv([makeTeam({ name: '=HYPERLINK("x")' })]);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(5);
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    });
  });

  describe('AdminTeamsView', () => {
    it('lists teams and narrows them with the search box', async () => {
      vi.spyOn(api.admin, 'getTeams').mockResolvedValue({
        items: [
          makeTeam(),
          makeTeam({
            id: '00000000-0000-4000-8000-0000000000cc',
            name: 'Byte Busters',
            participants: [],
          }),
        ],
        total: 2,
      });

      render(<AdminTeamsView />);

      await waitFor(() => expect(screen.getByText('2 of 2 teams')).toBeTruthy());
      fireEvent.change(screen.getByLabelText(/search teams/i), { target: { value: 'byte' } });
      expect(screen.getByText('1 of 2 teams')).toBeTruthy();
      expect(screen.queryByText('Quantum Coders')).toBeNull();
    });
  });

  describe('AdminTeamDetailView', () => {
    beforeEach(() => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(EVENT_STATE);
      vi.spyOn(api.admin, 'getChallenges').mockResolvedValue({ items: [], total: 0 });
    });

    it('checks a participant in manually after confirmation', async () => {
      const team = makeTeam();
      vi.spyOn(api.admin, 'getTeam').mockResolvedValue(team);
      const checkIn = vi.spyOn(api.admin, 'checkInParticipant').mockResolvedValue(
        makeTeam({
          progressState: 'checked_in',
          participants: team.participants.map((p, index) =>
            index === 1
              ? { ...p, checkedInAt: '2026-11-21T18:30:00.000Z', checkedInByName: 'Ops' }
              : p,
          ),
        }),
      );

      render(<AdminTeamDetailView teamId={TEAM_ID} />);

      await waitFor(() => expect(screen.getByText('Quantum Coders')).toBeTruthy());
      fireEvent.click(screen.getAllByRole('button', { name: 'Check in manually' })[1]);
      expect(checkIn).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));

      await waitFor(() => {
        expect(checkIn).toHaveBeenCalledWith(team.participants[1].id);
        expect(screen.getByText('Karim Member checked in.')).toBeTruthy();
      });
    });

    it('marks one member paid in one click and needs confirmation to undo it', async () => {
      const team = makeTeam();
      const paidTeam = makeTeam({
        participants: team.participants.map((p, index) =>
          index === 1 ? { ...p, paidAt: '2026-11-21T17:00:00.000Z', paidByName: 'Ops' } : p,
        ),
      });
      vi.spyOn(api.admin, 'getTeam').mockResolvedValue(team);
      const setPayment = vi
        .spyOn(api.admin, 'setParticipantPayment')
        .mockResolvedValueOnce(paidTeam)
        .mockResolvedValueOnce(team);

      render(<AdminTeamDetailView teamId={TEAM_ID} />);

      await waitFor(() => expect(screen.getByText('Quantum Coders')).toBeTruthy());
      expect(screen.getByText(`Paid 0 / ${team.participants.length}`)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Mark Karim Member as paid' }));
      await waitFor(() => {
        expect(setPayment).toHaveBeenCalledWith(team.participants[1].id, true);
        expect(screen.getByText('Karim Member marked as paid.')).toBeTruthy();
        expect(screen.getByText(`Paid 1 / ${team.participants.length}`)).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Mark Karim Member as unpaid' }));
      expect(setPayment).toHaveBeenCalledTimes(1);
      fireEvent.click(await screen.findByRole('button', { name: 'Mark unpaid' }));
      await waitFor(() => {
        expect(setPayment).toHaveBeenLastCalledWith(team.participants[1].id, false);
        expect(screen.getByText('Karim Member marked as unpaid.')).toBeTruthy();
      });
    });

    it('requires a reason before disqualifying a team', async () => {
      vi.spyOn(api.admin, 'getTeam').mockResolvedValue(makeTeam());
      const setStatus = vi
        .spyOn(api.admin, 'setTeamStatus')
        .mockResolvedValue(makeTeam({ status: 'disqualified', statusReason: 'Plagiarism' }));

      render(<AdminTeamDetailView teamId={TEAM_ID} />);

      await waitFor(() => expect(screen.getByText('Quantum Coders')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Disqualify' }));
      const confirm = await screen.findByRole('button', { name: 'Mark disqualified' });
      expect((confirm as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Plagiarism' } });
      fireEvent.click(confirm);

      await waitFor(() => {
        expect(setStatus).toHaveBeenCalledWith(TEAM_ID, {
          status: 'disqualified',
          reason: 'Plagiarism',
        });
        expect(screen.getByText('Team marked as disqualified.')).toBeTruthy();
      });
    });

    it('shows the temporary password once after a reset', async () => {
      vi.spyOn(api.admin, 'getTeam').mockResolvedValue(makeTeam());
      vi.spyOn(api.admin, 'resetTeamPassword').mockResolvedValue({
        teamId: TEAM_ID,
        temporaryPassword: 'temp-pass-1234567',
        revokedSessions: 2,
      });

      render(<AdminTeamDetailView teamId={TEAM_ID} />);

      await waitFor(() => expect(screen.getByText('Quantum Coders')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(2),
      );
      const resetButtons = screen.getAllByRole('button', { name: 'Reset password' });
      fireEvent.click(resetButtons[resetButtons.length - 1]);

      await waitFor(() => expect(screen.getByText('temp-pass-1234567')).toBeTruthy());
    });

    it('surfaces the server error and keeps the dialog open', async () => {
      vi.spyOn(api.admin, 'getTeam').mockResolvedValue(makeTeam());
      vi.spyOn(api.admin, 'removeParticipant').mockRejectedValue(new Error('boom'));

      render(<AdminTeamDetailView teamId={TEAM_ID} />);

      await waitFor(() => expect(screen.getByText('Quantum Coders')).toBeTruthy());
      const rowButtons = screen.getAllByRole('button', { name: 'Remove' });
      fireEvent.click(rowButtons[0]);
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBe(
          rowButtons.length + 1,
        ),
      );
      const dialogButtons = screen.getAllByRole('button', { name: 'Remove' });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() =>
        expect(screen.getByText('The action could not be completed.')).toBeTruthy(),
      );
    });
  });

  describe('AdminDashboardView situation board', () => {
    it('flags failed emails and partially checked-in teams', async () => {
      const overview: AdminOverviewResponse = {
        serverTime: '2026-11-21T18:00:00.000Z',
        phase: 'checkin',
        phaseChangedAt: '2026-11-21T17:00:00.000Z',
        teams: {
          total: 3,
          active: 3,
          withdrawn: 0,
          disqualified: 0,
          byProgress: {
            registered: 1,
            checked_in: 2,
            ctf_unlocked: 0,
            ctf_solved: 0,
            challenge_unlocked: 0,
            submitted: 0,
          },
          fullyCheckedIn: 1,
          partiallyCheckedIn: 1,
          notCheckedIn: 1,
        },
        participants: { total: 12, checkedIn: 6, byColor: [] },
        badges: { revoked: 0, emailSent: 10, emailPending: 0, emailFailed: 2, missingEmail: 0 },
        challenges: [],
        juryAccounts: 2,
        announcements: { total: 0, lastPublishedAt: null },
      };
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(EVENT_STATE);
      vi.spyOn(api, 'getHealth').mockResolvedValue({
        status: 'ok',
        uptimeSeconds: 10,
        timestamp: '2026-11-21T18:00:00.000Z',
        database: { status: 'up', latencyMs: 1 },
      });
      vi.spyOn(api.admin, 'getAuditLog').mockResolvedValue({ items: [], total: 0 });
      vi.spyOn(api.admin, 'getOverview').mockResolvedValue(overview);
      vi.spyOn(api.admin, 'getAnnouncements').mockResolvedValue({ items: [], total: 0 });
      const retry = vi.spyOn(api.admin, 'resendFailedBadgeEmails').mockResolvedValue({ queued: 2 });

      render(<AdminDashboardView />);

      await waitFor(() =>
        expect(screen.getByText('2 badge email(s) failed to send.')).toBeTruthy(),
      );
      expect(screen.getByText('1 team(s) are only partially checked in.')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Retry failed emails' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Queue emails' }));
      await waitFor(() => {
        expect(retry).toHaveBeenCalled();
        expect(screen.getByText(/2 badge email\(s\) queued/)).toBeTruthy();
      });
    });
  });

  describe('parseResources', () => {
    it('reads "Name | url" lines and reports invalid ones', () => {
      expect(parseResources('Dataset | https://example.com/data\n\nbroken line')).toEqual({
        links: [{ name: 'Dataset', url: 'https://example.com/data' }],
        invalid: ['broken line'],
      });
    });
  });
});
