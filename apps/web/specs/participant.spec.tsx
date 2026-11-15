import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeTrack, EventPhase, Role, TeamProgressState } from 'api-contracts';
import { Stepper } from '@/features/dashboard/stepper';
import { QrPassCard } from '@/features/dashboard/qr-pass-card';
import { TeamRoster } from '@/features/dashboard/team-roster';
import { MiniCtfView } from '@/features/mini-ctf/mini-ctf-view';
import { ChallengeView } from '@/features/challenges/challenge-view';
import { SubmissionsView } from '@/features/submissions/submissions-view';
import { AnnouncementsView } from '@/features/announcements/announcements-view';
import { RoleGuard } from '@/components/auth/role-guard';
import { AuthProvider } from '@/lib/auth/session';
import { api, ApiClientError } from '@/lib/api';
import type {
  TeamBadgesResponse,
  EventStateResponse,
  ParticipantProfile,
} from '@/lib/api/contracts/pending';

const LIVE_EVENT_STATE: EventStateResponse = {
  phase: EventPhase.Live,
  serverTime: '2026-11-21T20:00:00.000Z',
  nextPhase: EventPhase.SubmissionsClosed,
  nextPhaseAt: '2026-11-22T08:00:00.000Z',
  phaseLabel: 'Event is live',
};

describe('Participant / Team Features', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Stepper', () => {
    it('renders all canonical progression steps and marks current step', () => {
      render(<Stepper currentProgress={TeamProgressState.CtfUnlocked} />);

      expect(screen.getByText('Registered')).toBeTruthy();
      expect(screen.getByText('Checked In')).toBeTruthy();
      expect(screen.getByText('Mini-CTF Open')).toBeTruthy();
      expect(screen.getByText('Challenge Active')).toBeTruthy();

      const currentStep = screen.getByRole('listitem', { current: 'step' });
      expect(currentStep).toBeTruthy();
      expect(currentStep.textContent).toContain('Mini-CTF Open');
    });
  });

  describe('QrPassCard', () => {
    const badges: TeamBadgesResponse = {
      teamId: '00000000-0000-4000-8000-000000000001',
      teamName: 'Hackers United',
      badges: [
        {
          participantId: '00000000-0000-4000-8000-0000000000a1',
          participantName: 'Alice Developer',
          roleInTeam: 'leader',
          color: 'blue',
          qrToken: 'TOKEN-12345',
          qrImageDataUrl: 'data:image/png;base64,AAAA',
          isRevoked: false,
          isCheckedIn: false,
          email: 'alice@example.com',
          emailStatus: 'sent',
          emailLastSentAt: '2026-11-15T10:00:00.000Z',
          emailResendAvailableAt: '2999-01-01T00:00:00.000Z',
        },
        {
          participantId: '00000000-0000-4000-8000-0000000000a2',
          participantName: 'Bob Builder',
          roleInTeam: 'member',
          color: 'yellow',
          qrToken: null,
          qrImageDataUrl: null,
          isRevoked: false,
          isCheckedIn: false,
          email: 'bob@example.com',
          emailStatus: 'failed',
          emailLastSentAt: '2026-11-15T10:00:00.000Z',
          emailResendAvailableAt: null,
        },
      ],
    };

    it('shows every member badge with its color, QR code and email state', () => {
      render(<QrPassCard badges={badges} />);

      expect(screen.getByText('Alice Developer')).toBeTruthy();
      expect(screen.getByText('Blue group')).toBeTruthy();
      expect(screen.getByText('Yellow group')).toBeTruthy();
      expect(screen.getByAltText(/Entrance QR code for Alice Developer/)).toBeTruthy();
      expect(screen.getByText(/Email to bob@example.com failed/)).toBeTruthy();
      expect(screen.getByText(/Resend the email to get a new one/)).toBeTruthy();
    });

    it('disables resend until the hourly limit has passed', () => {
      render(<QrPassCard badges={badges} />);

      const [aliceResend, bobResend] = screen.getAllByRole('button', { name: /Resend email/ });
      expect((aliceResend as HTMLButtonElement).disabled).toBe(true);
      expect((bobResend as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('TeamRoster', () => {
    const mockMembers: ParticipantProfile[] = [
      {
        id: '1',
        teamId: 't-1',
        fullName: 'Alice Leader',
        email: 'alice@test.com',
        roleInTeam: 'leader',
        isCheckedIn: true,
      },
      {
        id: '2',
        teamId: 't-1',
        fullName: 'Bob Coder',
        email: 'bob@test.com',
        roleInTeam: 'member',
        isCheckedIn: false,
      },
    ];

    it('renders roster table with leader status and check-in status', () => {
      render(<TeamRoster members={mockMembers} />);

      expect(screen.getByText('Alice Leader')).toBeTruthy();
      expect(screen.getByText('Bob Coder')).toBeTruthy();
      expect(screen.getByText('Team Leader')).toBeTruthy();
      expect(screen.getByText('Checked In')).toBeTruthy();
      expect(screen.getByText('Pending Check-In')).toBeTruthy();
    });
  });

  describe('MiniCtfView', () => {
    it('renders the flag form and validates flag submission', async () => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(LIVE_EVENT_STATE);
      vi.spyOn(api.miniCtf, 'getStatus')
        .mockResolvedValueOnce({
          isOpen: true,
          isSolved: false,
          attemptsCount: 0,
          cooldownUntil: null,
          hint: 'Inspect the platform challenge hints.',
        })
        .mockResolvedValueOnce({
          isOpen: true,
          isSolved: true,
          solvedAt: '2026-11-21T20:05:00.000Z',
          attemptsCount: 1,
          cooldownUntil: null,
          hint: 'Inspect the platform challenge hints.',
        });
      vi.spyOn(api.miniCtf, 'submitFlag')
        .mockRejectedValueOnce(
          new ApiClientError({
            message: 'Incorrect flag. Please check the challenge hints and try again.',
            status: 400,
            code: 'CTF_NOT_SOLVED',
          }),
        )
        .mockResolvedValueOnce({
          success: true,
          message: 'Correct flag! Your main track challenge has been unlocked.',
          progress: TeamProgressState.ChallengeUnlocked,
          unlockedChallengeTrack: ChallengeTrack.TrackA,
        });

      render(<MiniCtfView />);

      await waitFor(() => {
        expect(screen.getByText(/Mini-CTF Track Gate/i)).toBeTruthy();
      });

      const input = screen.getByLabelText(/Mini-CTF Flag/i) as HTMLInputElement;
      expect(input).toBeTruthy();

      // Enter invalid flag
      fireEvent.change(input, { target: { value: 'WRONG_FLAG' } });
      const submitBtn = screen.getByRole('button', { name: /Submit Flag/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const matches = screen.getAllByText(/Incorrect Flag/i);
        expect(matches.length).toBeGreaterThan(0);
      });

      // Enter correct mock flag
      fireEvent.change(input, { target: { value: 'LILTECH{mock_flag_demo}' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Mini-CTF Solved!/i)).toBeTruthy();
      });
    });

    it('shows the locked state while the gate is closed', async () => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(LIVE_EVENT_STATE);
      vi.spyOn(api.miniCtf, 'getStatus').mockResolvedValue({
        isOpen: false,
        isSolved: false,
        attemptsCount: 0,
        cooldownUntil: null,
        hint: undefined,
      });

      render(<MiniCtfView />);

      await waitFor(() => {
        expect(screen.getByText(/The Mini-CTF is Locked/i)).toBeTruthy();
      });
      expect(screen.queryByLabelText(/Mini-CTF Flag/i)).toBeNull();
    });
  });

  describe('ChallengeView', () => {
    const mockChallenge = {
      id: 'chal-1',
      track: ChallengeTrack.TrackA,
      title: 'Autonomous AI Logistics Dispatcher',
      description: 'Build an intelligent dispatching engine.',
      problemStatement: 'Routing delays hurt emergency response teams.',
      deliverablesRequirements: ['Runnable repo', 'Architecture doc'],
      resources: [{ name: 'Urban Telemetry Dataset', url: '#', size: '2.4 MB' }],
    };

    it('displays the challenge brief once the Mini-CTF is solved', async () => {
      vi.spyOn(api.challenges, 'getCurrentChallenge').mockResolvedValue(mockChallenge);

      render(<ChallengeView />);

      await waitFor(() => {
        expect(screen.getByText(/Autonomous AI Logistics Dispatcher/i)).toBeTruthy();
        expect(screen.getByText(/Problem Statement/i)).toBeTruthy();
        expect(screen.getByText(/Deliverable Requirements/i)).toBeTruthy();
        expect(screen.getByText(/Urban Telemetry Dataset/i)).toBeTruthy();
      });
    });

    it('shows the locked state while the Mini-CTF is unsolved', async () => {
      vi.spyOn(api.challenges, 'getCurrentChallenge').mockRejectedValue(
        new ApiClientError({
          message: 'Challenge track locked. You must solve the Mini-CTF first.',
          status: 403,
          code: 'CTF_NOT_SOLVED',
        }),
      );

      render(<ChallengeView />);

      await waitFor(() => {
        expect(screen.getByText(/Mini-CTF Clearance Required/i)).toBeTruthy();
      });
    });
  });

  describe('SubmissionsView', () => {
    it('displays deliverable submission form and records a new version', async () => {
      const versionOne = {
        id: 'sub-001',
        teamId: 'dev-team-01',
        track: ChallengeTrack.TrackA,
        title: 'Initial Architecture Draft & Prototype',
        description: 'First version of the dispatch engine.',
        repoUrl: 'https://github.com/sample-builders/liltech-dispatcher',
        fileName: 'prototype-v1.zip',
        fileSizeBytes: 1048576,
        submittedAt: '2026-11-21T21:15:00.000Z',
        version: 1,
      };

      vi.spyOn(api.events, 'getEventState').mockResolvedValue(LIVE_EVENT_STATE);
      vi.spyOn(api.submissions, 'getMyTeamSubmissions').mockResolvedValue({
        submissions: [versionOne],
        current: versionOne,
        isLocked: false,
        deadline: '2026-11-22T08:00:00.000Z',
      });
      vi.spyOn(api.submissions, 'createSubmission').mockResolvedValue({
        ...versionOne,
        id: 'sub-002',
        title: 'Autonomous Dispatch Engine v2',
        submittedAt: '2026-11-21T22:15:00.000Z',
        version: 2,
      });

      render(<SubmissionsView />);

      await waitFor(() => {
        expect(screen.getByText(/Project Submissions/i)).toBeTruthy();
      });

      const titleInput = screen.getByLabelText(/Deliverable Title/i);
      fireEvent.change(titleInput, { target: { value: 'Autonomous Dispatch Engine v2' } });

      const repoInput = screen.getByLabelText(/Git Repository URL/i);
      fireEvent.change(repoInput, { target: { value: 'https://github.com/myteam/dispatcher' } });

      const submitBtn = screen.getByRole('button', { name: /Submit Deliverables/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Deliverable submission v2 recorded successfully!/i)).toBeTruthy();
      });
    });
  });

  describe('AnnouncementsView', () => {
    it('renders announcements list and filters by priority', async () => {
      vi.spyOn(api.announcements, 'getAnnouncements').mockResolvedValue({
        items: [
          {
            id: 'ann-001',
            title: 'LilTech 2026 is LIVE! Mini-CTF is Open',
            content: 'Welcome hackers!',
            priority: 'broadcast',
            createdAt: '2026-11-21T19:30:00.000Z',
          },
          {
            id: 'ann-003',
            title: 'Buffet Open in Campus Atrium',
            content: 'Late-night snacks served.',
            priority: 'urgent',
            createdAt: '2026-11-21T21:00:00.000Z',
          },
        ],
        total: 2,
      });

      render(<AnnouncementsView />);

      await waitFor(() => {
        expect(screen.getByText(/Live Announcements/i)).toBeTruthy();
        expect(screen.getByText(/LilTech 2026 is LIVE!/i)).toBeTruthy();
      });

      // Filter by Urgent
      const urgentFilterBtn = screen.getByRole('button', { name: /Urgent/i });
      fireEvent.click(urgentFilterBtn);

      expect(screen.getByText(/Buffet Open in Campus Atrium/i)).toBeTruthy();
      expect(screen.queryByText(/LilTech 2026 is LIVE!/i)).toBeNull();
    });
  });

  describe('RoleGuard', () => {
    it('allows access when user has Role.Team', async () => {
      vi.spyOn(api.auth, 'getSession').mockResolvedValue({
        user: {
          id: 'team-1',
          name: 'Team Account',
          email: 'team@example.com',
          role: Role.Team,
        },
        serverTime: '2026-11-21T18:00:00.000Z',
      });

      render(
        <AuthProvider>
          <RoleGuard allowedRoles={[Role.Team]}>
            <div>Team Protected Content</div>
          </RoleGuard>
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Team Protected Content')).toBeTruthy();
      });
    });
  });
});
