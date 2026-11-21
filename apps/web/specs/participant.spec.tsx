import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeTrack, EventPhase, Role, TeamProgressState } from 'api-contracts';
import { Stepper } from '@/features/dashboard/stepper';
import { QrPassCard } from '@/features/dashboard/qr-pass-card';
import { TeamRoster } from '@/features/dashboard/team-roster';
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

  describe('ChallengeView', () => {
    const schedule = {
      id: '00000000-0000-4000-8000-0000000000c1',
      position: 1,
      title: 'Autonomous AI Logistics Dispatcher',
      summary: 'Route emergency vehicles faster.',
      status: 'live' as const,
      startedAt: '2026-11-21T19:00:00.000Z',
      endedAt: null,
      publicAt: '2026-11-21T20:00:00.000Z',
      publicDelayMinutes: 60,
      submissionDeadline: null,
    };

    it('displays the challenge brief when the team has access', async () => {
      vi.spyOn(api.challenges, 'getCurrentChallenge').mockResolvedValue({
        available: true,
        phase: EventPhase.Live,
        serverTime: '2026-11-21T19:10:00.000Z',
        current: {
          challenge: schedule,
          access: 'early',
          ctfSolved: true,
          unlocksAt: null,
          forcedOpen: false,
          submissionOpen: true,
          content: {
            description: 'Build an intelligent dispatching engine.',
            problemStatement: 'Routing delays hurt emergency response teams.',
            deliverables: ['Runnable repo', 'Architecture doc'],
            resources: [{ name: 'Urban Telemetry Dataset', url: 'https://example.com/data' }],
          },
        },
      });

      render(<ChallengeView />);

      await waitFor(() => {
        expect(screen.getByText(/Autonomous AI Logistics Dispatcher/i)).toBeTruthy();
        expect(screen.getByText(/Problem Statement/i)).toBeTruthy();
        expect(screen.getByText(/Early access/i)).toBeTruthy();
        expect(screen.getByText(/Urban Telemetry Dataset/i)).toBeTruthy();
      });
    });

    it('shows the locked state with the public reveal time', async () => {
      vi.spyOn(api.challenges, 'getCurrentChallenge').mockResolvedValue({
        available: true,
        phase: EventPhase.Live,
        serverTime: '2026-11-21T19:10:00.000Z',
        current: {
          challenge: schedule,
          access: 'locked',
          ctfSolved: false,
          unlocksAt: '2026-11-21T20:00:00.000Z',
          forcedOpen: false,
          submissionOpen: false,
          content: null,
        },
      });

      render(<ChallengeView />);

      await waitFor(() => {
        expect(screen.getByText(/Challenge Locked/i)).toBeTruthy();
        expect(screen.getByText(/opens to every team at/i)).toBeTruthy();
      });
    });

    it('explains that the hackathon has not started yet', async () => {
      vi.spyOn(api.challenges, 'getCurrentChallenge').mockResolvedValue({
        available: false,
        reason: 'EVENT_NOT_STARTED',
        phase: EventPhase.Registration,
        message: "The hackathon hasn't started yet.",
      });

      render(<ChallengeView />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /hasn't started yet/i })).toBeTruthy();
      });
    });
  });

  describe('SubmissionsView', () => {
    const challengeOne = {
      id: '00000000-0000-4000-8000-0000000000c1',
      position: 1,
      title: 'Poster, logo and teaser',
      summary: 'One Drive link with your visual identity.',
      status: 'live' as const,
      startedAt: '2026-11-21T19:00:00.000Z',
      endedAt: null,
      publicAt: '2026-11-21T19:00:00.000Z',
      publicDelayMinutes: 60,
      submissionDeadline: '2026-11-22T08:00:00.000Z',
    };

    const challengeTwo = {
      ...challengeOne,
      id: '00000000-0000-4000-8000-0000000000c2',
      position: 2,
      title: 'Technical project',
      status: 'upcoming' as const,
      startedAt: null,
      publicAt: null,
      submissionDeadline: null,
    };

    const submission = {
      id: '00000000-0000-4000-8000-00000000aa01',
      challengeId: challengeOne.id,
      challengePosition: 1,
      driveUrl: 'https://drive.google.com/file/d/first/view',
      githubUrl: null,
      reportUrl: null,
      presentationUrl: null,
      commitSha: null,
      submittedAt: '2026-11-21T21:15:00.000Z',
      isCurrent: true,
    };

    it('submits a Drive link for challenge 01 and shows its history', async () => {
      const getOverview = vi.spyOn(api.submissions, 'getOverview').mockResolvedValue({
        phase: EventPhase.Live,
        serverTime: '2026-11-21T21:20:00.000Z',
        items: [
          {
            challenge: challengeOne,
            access: 'public',
            canSubmit: true,
            blockedReason: null,
            current: submission,
            history: [submission],
          },
          {
            challenge: challengeTwo,
            access: 'locked',
            canSubmit: false,
            blockedReason: 'CHALLENGE_NOT_STARTED',
            current: null,
            history: [],
          },
        ],
      });
      const create = vi.spyOn(api.submissions, 'create').mockResolvedValue({
        ...submission,
        id: '00000000-0000-4000-8000-00000000aa02',
        driveUrl: 'https://drive.google.com/file/d/second/view',
        submittedAt: '2026-11-21T22:15:00.000Z',
      });

      render(<SubmissionsView />);

      await waitFor(() => {
        expect(screen.getByText(/Challenge submissions/i)).toBeTruthy();
      });

      expect(screen.getByRole('heading', { name: /Technical project/i })).toBeTruthy();
      expect(screen.getByText(/has not started yet/i)).toBeTruthy();

      const driveInput = screen.getByLabelText(/Google Drive link/i);
      fireEvent.change(driveInput, {
        target: { value: 'https://drive.google.com/file/d/second/view' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Submit a new version/i }));

      await waitFor(() => {
        expect(create).toHaveBeenCalledWith({
          challengePosition: 1,
          driveUrl: 'https://drive.google.com/file/d/second/view',
        });
      });
      await waitFor(() => {
        expect(screen.getByText(/Submission recorded/i)).toBeTruthy();
      });
      expect(getOverview).toHaveBeenCalled();
    });

    it('submits only the GitHub repository and presentation for challenge 02', async () => {
      const openChallengeTwo = {
        ...challengeTwo,
        status: 'live' as const,
        startedAt: '2026-11-21T22:00:00.000Z',
        publicAt: '2026-11-21T22:00:00.000Z',
        submissionDeadline: '2026-11-22T08:00:00.000Z',
      };

      vi.spyOn(api.submissions, 'getOverview').mockResolvedValue({
        phase: EventPhase.Live,
        serverTime: '2026-11-21T22:10:00.000Z',
        items: [
          {
            challenge: challengeOne,
            access: 'public',
            canSubmit: false,
            blockedReason: 'SUBMISSIONS_CLOSED',
            current: submission,
            history: [submission],
          },
          {
            challenge: openChallengeTwo,
            access: 'public',
            canSubmit: true,
            blockedReason: null,
            current: null,
            history: [],
          },
        ],
      });
      const create = vi.spyOn(api.submissions, 'create').mockResolvedValue({
        id: '00000000-0000-4000-8000-00000000bb01',
        challengeId: openChallengeTwo.id,
        challengePosition: 2,
        driveUrl: null,
        githubUrl: 'https://github.com/liltech/project',
        reportUrl: null,
        presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
        commitSha: null,
        submittedAt: '2026-11-21T22:15:00.000Z',
        isCurrent: true,
      });

      render(<SubmissionsView />);

      await waitFor(() => {
        expect(screen.getByText(/Challenge submissions/i)).toBeTruthy();
      });

      expect(screen.queryByLabelText(/Technical report/i)).toBeNull();

      fireEvent.change(screen.getByLabelText(/GitHub repository/i), {
        target: { value: 'https://github.com/liltech/project' },
      });
      fireEvent.change(screen.getByLabelText(/Presentation/i), {
        target: { value: 'https://docs.google.com/presentation/d/slides/edit' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Submit deliverables/i }));

      await waitFor(() => {
        expect(create).toHaveBeenCalledWith({
          challengePosition: 2,
          githubUrl: 'https://github.com/liltech/project',
          presentationUrl: 'https://docs.google.com/presentation/d/slides/edit',
        });
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
