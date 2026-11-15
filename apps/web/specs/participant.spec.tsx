import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  BadgePassResponse,
  EventStateResponse,
  ParticipantProfile,
} from '@/lib/api/contracts/pending';
import type { CtfStageResponse } from 'api-contracts';

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
    const mockBadge: BadgePassResponse = {
      participantId: 'p-1',
      participantName: 'Alice Developer',
      teamId: 't-1',
      teamName: 'Hackers United',
      track: ChallengeTrack.TrackA,
      qrData: 'data:image/svg+xml;utf8,<svg></svg>',
      qrToken: 'TOKEN-12345',
    };

    it('renders participant details and badge QR image', () => {
      render(<QrPassCard badge={mockBadge} />);

      expect(screen.getByText('Alice Developer')).toBeTruthy();
      expect(screen.getByText('Hackers United')).toBeTruthy();
      expect(screen.getByText('Track A')).toBeTruthy();
      expect(screen.getByAltText(/Personal entrance QR code for Alice Developer/)).toBeTruthy();
      expect(screen.getByText(/Save Badge to Device/)).toBeTruthy();
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
    const openStage: CtfStageResponse = {
      stage: {
        id: '00000000-0000-4000-8000-000000000001',
        slug: 'louage-404',
        position: 1,
        title: 'Louage 404',
        description: null,
        assetImageUrl: null,
        assetZipUrl: '/ctf/step-1/CTF.zip',
        hintCount: 3,
      },
      progress: {
        isOpen: true,
        isSolved: false,
        solvedAt: null,
        attempts: 0,
        hintsUsed: 0,
        mainChallengeUnlocked: false,
      },
      hints: [],
    };

    const solvedStage: CtfStageResponse = {
      ...openStage,
      progress: {
        ...openStage.progress,
        isSolved: true,
        solvedAt: '2026-11-21T20:05:00.000Z',
        attempts: 1,
        mainChallengeUnlocked: true,
      },
    };

    it('validates the answer and shows the solved state', async () => {
      vi.spyOn(api.ctf, 'getStage')
        .mockResolvedValueOnce(openStage)
        .mockResolvedValueOnce(solvedStage);
      vi.spyOn(api.ctf, 'submitAnswer')
        .mockRejectedValueOnce(
          new ApiClientError({
            message: 'That answer is not right. Re-read the archive contents and try again.',
            status: 400,
            code: 'CTF_NOT_SOLVED',
          }),
        )
        .mockResolvedValueOnce({
          success: true,
          message: 'El série t2akkdet. Your main challenge is now unlocked.',
          isSolved: true,
          solvedAt: '2026-11-21T20:05:00.000Z',
          mainChallengeUnlocked: true,
        });

      render(<MiniCtfView />);

      await waitFor(() => {
        expect(screen.getByText(/Louage 404/i)).toBeTruthy();
      });

      const input = screen.getByLabelText(/Registration/i) as HTMLInputElement;
      expect(input).toBeTruthy();

      fireEvent.change(input, { target: { value: '000 TUN 0000' } });
      fireEvent.click(screen.getByRole('button', { name: /Submit Answer/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/Incorrect Answer/i).length).toBeGreaterThan(0);
      });

      fireEvent.change(input, { target: { value: '187 TUN 4253' } });
      fireEvent.click(screen.getByRole('button', { name: /Submit Answer/i }));

      await waitFor(() => {
        expect(screen.getByText(/Mini-CTF Solved!/i)).toBeTruthy();
      });
    });

    it('shows the locked state while the gate is closed', async () => {
      vi.spyOn(api.ctf, 'getStage').mockResolvedValue({
        ...openStage,
        progress: { ...openStage.progress, isOpen: false },
      });

      render(<MiniCtfView />);

      await waitFor(() => {
        expect(screen.getByText(/The Mini-CTF is locked/i)).toBeTruthy();
      });
      expect(screen.queryByLabelText(/Registration/i)).toBeNull();
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
