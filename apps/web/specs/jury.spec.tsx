import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChallengeTrack, EventPhase, Role, TeamProgressState } from 'api-contracts';
import { JuryOverviewView } from '@/features/jury/jury-overview-view';
import { TeamEvaluationView } from '@/features/jury/team-evaluation-view';
import { RoleGuard } from '@/components/auth/role-guard';
import { AuthProvider } from '@/lib/auth/session';
import { api, ApiClientError } from '@/lib/api';
import type {
  JuryOverviewResponse,
  JuryTeamEvaluationResponse,
  JuryTeamItem,
} from '@/lib/api/contracts/pending';

const MOCK_OVERVIEW: JuryOverviewResponse = {
  track: ChallengeTrack.TrackA,
  trackTitle: 'Track A — Autonomous AI Logistics Dispatcher',
  trackDescription:
    'Design and implement an autonomous real-time routing engine optimizing multi-agent vehicle dispatch under live dynamic constraints.',
  assignedJury: {
    id: 'jury-01',
    name: 'Dr. Jane Smith',
    email: 'jane.smith@jury.liltech',
  },
  eventPhase: EventPhase.Pitching,
  totalTeams: 3,
  evaluatedTeams: 1,
  pendingTeams: 2,
  averageScore: 88,
  scoringOpen: true,
};

const MOCK_TEAMS: JuryTeamItem[] = [
  {
    id: 'team-01',
    name: 'Sample Builders',
    track: ChallengeTrack.TrackA,
    progress: TeamProgressState.Submitted,
    membersCount: 3,
    submitted: true,
    submittedAt: '2026-11-21T21:15:00.000Z',
    submissionTitle: 'Initial Architecture Draft & Prototype',
    submissionRepoUrl: 'https://github.com/sample-builders/liltech-dispatcher',
    submissionFileName: 'prototype-v1.zip',
    evaluationStatus: 'pending',
    myScore: null,
    evaluatedAt: null,
  },
  {
    id: 'team-02',
    name: 'Quantum Coders',
    track: ChallengeTrack.TrackA,
    progress: TeamProgressState.Submitted,
    membersCount: 4,
    submitted: true,
    submittedAt: '2026-11-21T22:45:00.000Z',
    submissionTitle: 'Neural Fleet Optimization Dispatcher',
    submissionRepoUrl: 'https://github.com/quantum-coders/fleet-ai',
    submissionFileName: 'quantum-dispatcher-v2.tar.gz',
    evaluationStatus: 'graded',
    myScore: 88,
    evaluatedAt: '2026-11-22T09:30:00.000Z',
  },
  {
    id: 'team-03',
    name: 'Algorithmic Titans',
    track: ChallengeTrack.TrackA,
    progress: TeamProgressState.Submitted,
    membersCount: 4,
    submitted: true,
    submittedAt: '2026-11-22T04:10:00.000Z',
    submissionTitle: 'Dynamic Urban Route Clustering',
    submissionRepoUrl: 'https://github.com/algo-titans/route-clustering',
    submissionFileName: 'algo-titans-solution.zip',
    evaluationStatus: 'pending',
    myScore: null,
    evaluatedAt: null,
  },
];

const MOCK_EVALUATION_DATA: JuryTeamEvaluationResponse = {
  team: MOCK_TEAMS[0],
  members: [
    { id: 'm1', fullName: 'Alice Johnson', roleInTeam: 'leader' },
    { id: 'm2', fullName: 'Bob Martin', roleInTeam: 'member' },
    { id: 'm3', fullName: 'Charlie Lee', roleInTeam: 'member' },
  ],
  submission: {
    submittedAt: '2026-11-21T21:15:00.000Z',
    version: 2,
    driveUrl: 'https://drive.google.com/drive/folders/sample-builders',
    githubUrl: 'https://github.com/sample-builders/liltech-dispatcher',
    reportUrl: null,
    presentationUrl: 'https://docs.google.com/presentation/d/sample-pitch',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
  },
  evaluation: null,
  scoringOpen: true,
};

describe('Jury Portal Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('JuryOverviewView', () => {
    it('renders assigned track overview, metrics, and team table', async () => {
      vi.spyOn(api.jury, 'getOverview').mockResolvedValue(MOCK_OVERVIEW);
      vi.spyOn(api.jury, 'getAssignedTeams').mockResolvedValue(MOCK_TEAMS);

      render(<JuryOverviewView />);

      expect(screen.getByText(/loading your assigned challenge track/i)).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByText('Track A — Autonomous AI Logistics Dispatcher')).toBeTruthy();
      });

      // Verify metrics
      expect(screen.getByText('Assigned Track Teams')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy(); // total teams
      expect(screen.getByText('1 / 3')).toBeTruthy(); // evaluated by you
      expect(screen.getByText('2')).toBeTruthy(); // pending evaluations
      expect(screen.getByText('88')).toBeTruthy(); // average score

      // Verify table rows
      expect(screen.getByText('Sample Builders')).toBeTruthy();
      expect(screen.getByText('Quantum Coders')).toBeTruthy();
      expect(screen.getByText('Algorithmic Titans')).toBeTruthy();

      // Check evaluation status badges in table and metric card
      expect(screen.getByText(/Graded: 88 \/ 100/i)).toBeTruthy();
      expect(screen.getAllByText(/Pending Evaluation/i).length).toBe(3); // 1 in metric card, 2 in table
    });

    it('filters teams by evaluation status and search query', async () => {
      vi.spyOn(api.jury, 'getOverview').mockResolvedValue(MOCK_OVERVIEW);
      vi.spyOn(api.jury, 'getAssignedTeams').mockResolvedValue(MOCK_TEAMS);

      render(<JuryOverviewView />);

      await waitFor(() => {
        expect(screen.getByText('Sample Builders')).toBeTruthy();
      });

      // Click "Graded" filter tab
      const gradedTab = screen.getByRole('tab', { name: /graded \(1\)/i });
      fireEvent.click(gradedTab);

      expect(screen.getByText('Quantum Coders')).toBeTruthy();
      expect(screen.queryByText('Sample Builders')).toBeNull();
      expect(screen.queryByText('Algorithmic Titans')).toBeNull();

      // Click "Pending" filter tab
      const pendingTab = screen.getByRole('tab', { name: /pending \(2\)/i });
      fireEvent.click(pendingTab);

      expect(screen.getByText('Sample Builders')).toBeTruthy();
      expect(screen.getByText('Algorithmic Titans')).toBeTruthy();
      expect(screen.queryByText('Quantum Coders')).toBeNull();

      // Search query filtering
      const searchInput = screen.getByLabelText(/search assigned teams/i);
      fireEvent.change(searchInput, { target: { value: 'Titans' } });

      expect(screen.getByText('Algorithmic Titans')).toBeTruthy();
      expect(screen.queryByText('Sample Builders')).toBeNull();
    });

    it('renders error state and retries on failure', async () => {
      vi.spyOn(api.jury, 'getOverview').mockRejectedValueOnce(
        new ApiClientError({ message: 'Network timeout', status: 503, code: 'NETWORK_ERROR' }),
      );

      render(<JuryOverviewView />);

      await waitFor(() => {
        expect(screen.getByText(/Jury Portal Unavailable/i)).toBeTruthy();
        expect(screen.getByText(/Network timeout/i)).toBeTruthy();
      });

      // Mock success for retry
      vi.spyOn(api.jury, 'getOverview').mockResolvedValue(MOCK_OVERVIEW);
      vi.spyOn(api.jury, 'getAssignedTeams').mockResolvedValue(MOCK_TEAMS);

      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Track A — Autonomous AI Logistics Dispatcher')).toBeTruthy();
      });
    });
  });

  describe('TeamEvaluationView', () => {
    it('renders team deliverables and criteria scoring inputs', async () => {
      vi.spyOn(api.jury, 'getTeamEvaluation').mockResolvedValue(MOCK_EVALUATION_DATA);

      render(<TeamEvaluationView teamId="team-01" />);

      await waitFor(() => {
        expect(screen.getByText('Sample Builders')).toBeTruthy();
      });

      // Verify deliverables: every link of the latest submission, no empty ones
      expect(screen.getByText('Latest submission (the one that counts)')).toBeTruthy();
      expect(
        screen
          .getByRole('link', { name: /GitHub repository of Sample Builders/i })
          .getAttribute('href'),
      ).toBe('https://github.com/sample-builders/liltech-dispatcher');
      expect(
        screen.getByRole('link', { name: /Google Drive folder of Sample Builders/i }),
      ).toBeTruthy();
      expect(screen.getByRole('link', { name: /Presentation of Sample Builders/i })).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Technical report/i })).toBeNull();
      expect(screen.getByText('Commit 0123456')).toBeTruthy();
      expect(screen.getByText(/Version 2/)).toBeTruthy();

      // Verify all 4 criteria are displayed
      expect(screen.getByText('Technical Execution & Architecture')).toBeTruthy();
      expect(screen.getByText('Innovation & Problem Solving')).toBeTruthy();
      expect(screen.getByText('UI/UX & Usability')).toBeTruthy();
      expect(screen.getByText('Pitch, Defense & Q&A')).toBeTruthy();

      // Default score total: 18 * 4 = 72
      expect(screen.getByText('72')).toBeTruthy();
      expect(screen.getByText('/ 100')).toBeTruthy();
    });

    it('locks the form outside the scoring window', async () => {
      vi.spyOn(api.jury, 'getTeamEvaluation').mockResolvedValue({
        ...MOCK_EVALUATION_DATA,
        scoringOpen: false,
      });

      render(<TeamEvaluationView teamId="team-01" />);

      await waitFor(() => {
        expect(screen.getByText('Scoring is not open')).toBeTruthy();
      });
      expect(
        (screen.getByRole('button', { name: /submit evaluation/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('updates scores dynamically via presets and inputs', async () => {
      vi.spyOn(api.jury, 'getTeamEvaluation').mockResolvedValue(MOCK_EVALUATION_DATA);

      render(<TeamEvaluationView teamId="team-01" />);

      await waitFor(() => {
        expect(screen.getByText('Sample Builders')).toBeTruthy();
      });

      // Click preset 25 pts for Technical Execution
      const presetButtons = screen.getAllByRole('button', { name: /set score to 25/i });
      fireEvent.click(presetButtons[0]);

      // Score should now be 25 + 18 + 18 + 18 = 79
      await waitFor(() => {
        expect(screen.getByText('79')).toBeTruthy();
      });
    });

    it('submits evaluation and renders confirmation banner', async () => {
      vi.spyOn(api.jury, 'getTeamEvaluation').mockResolvedValue(MOCK_EVALUATION_DATA);
      const submitSpy = vi.spyOn(api.jury, 'submitEvaluation').mockResolvedValue({
        success: true,
        teamId: 'team-01',
        totalScore: 85,
        evaluatedAt: '2026-11-22T10:00:00.000Z',
        message: 'Team evaluation submitted successfully.',
      });

      render(<TeamEvaluationView teamId="team-01" />);

      await waitFor(() => {
        expect(screen.getByText('Sample Builders')).toBeTruthy();
      });

      // Add notes
      const notesField = screen.getByLabelText(/Private Jury Notes/i);
      fireEvent.change(notesField, { target: { value: 'Excellent technical defense.' } });

      const submitBtn = screen.getByRole('button', { name: /submit evaluation/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledWith(
          'team-01',
          expect.objectContaining({
            notes: 'Excellent technical defense.',
          }),
        );
        expect(
          screen.getByText(/Evaluation recorded successfully! Total Score: 85 \/ 100/i),
        ).toBeTruthy();
      });
    });

    it('handles track isolation access forbidden error', async () => {
      vi.spyOn(api.jury, 'getTeamEvaluation').mockRejectedValue(
        new ApiClientError({
          message: 'Access restricted: this team belongs to a different challenge track.',
          status: 403,
          code: 'FORBIDDEN',
        }),
      );

      render(<TeamEvaluationView teamId="team-track-b" />);

      await waitFor(() => {
        expect(screen.getByText(/Could Not Load Evaluation Workspace/i)).toBeTruthy();
        expect(
          screen.getByText(/Access restricted: this team belongs to a different challenge track/i),
        ).toBeTruthy();
      });
    });
  });

  describe('RoleGuard for Jury Portal', () => {
    it('allows access for users with Role.Jury', async () => {
      vi.spyOn(api.auth, 'getSession').mockResolvedValue({
        user: {
          id: 'j1',
          name: 'Jury Evaluator',
          email: 'jury@liltech.mock',
          role: Role.Jury,
          assignedTrack: ChallengeTrack.TrackA,
        },
        serverTime: '2026-11-21T20:00:00.000Z',
      });

      render(
        <AuthProvider>
          <RoleGuard allowedRoles={[Role.Jury]}>
            <div>Confidential Jury Evaluation Portal</div>
          </RoleGuard>
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Confidential Jury Evaluation Portal')).toBeTruthy();
      });
    });

    it('blocks access for users with Role.Team', async () => {
      vi.spyOn(api.auth, 'getSession').mockResolvedValue({
        user: {
          id: 't1',
          name: 'Team Leader',
          email: 'team@liltech.mock',
          role: Role.Team,
        },
        serverTime: '2026-11-21T20:00:00.000Z',
      });

      render(
        <AuthProvider>
          <RoleGuard allowedRoles={[Role.Jury]}>
            <div>Confidential Jury Evaluation Portal</div>
          </RoleGuard>
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Access restricted/i)).toBeTruthy();
        expect(
          screen.getByText(/Your current account \(Team\) does not have access/i),
        ).toBeTruthy();
        expect(screen.queryByText('Confidential Jury Evaluation Portal')).toBeNull();
      });
    });
  });
});
