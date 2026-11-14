import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EventPhase, Role, type BadgeSummary, type CheckInResponse } from 'api-contracts';
import { AdminDashboardView } from '@/features/admin/admin-dashboard-view';
import { CheckInScannerView, extractTokenFromQr } from '@/features/checkin/checkin-scanner-view';
import { RoleGuard } from '@/components/auth/role-guard';
import { AuthProvider } from '@/lib/auth/session';
import { api, ApiClientError } from '@/lib/api';
import type { EventStateResponse } from '@/lib/api/contracts/pending';

const MOCK_EVENT_STATE: EventStateResponse = {
  phase: EventPhase.Checkin,
  serverTime: '2026-11-21T18:00:00.000Z',
  nextPhase: EventPhase.Live,
  nextPhaseAt: '2026-11-21T19:00:00.000Z',
  phaseLabel: 'Checkin Open',
};

const MOCK_BADGES: BadgeSummary[] = [
  {
    participantId: '00000000-0000-4000-8000-000000000001',
    participantName: 'Sarra Ben Ahmed',
    teamName: 'Quantum Coders',
    issuedAt: '2026-11-20T10:00:00.000Z',
    checkedInAt: '2026-11-21T18:15:00.000Z',
  },
  {
    participantId: '00000000-0000-4000-8000-000000000002',
    participantName: 'Karim Mansour',
    teamName: 'Sample Builders',
    issuedAt: '2026-11-20T10:00:00.000Z',
    checkedInAt: undefined,
  },
  {
    participantId: '00000000-0000-4000-8000-000000000003',
    participantName: 'Amira Dridi',
    teamName: 'Algorithmic Titans',
    issuedAt: '2026-11-20T10:00:00.000Z',
    revokedAt: '2026-11-21T17:00:00.000Z',
  },
];

const MOCK_SCAN_RESPONSE: CheckInResponse = {
  participant: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Karim Mansour',
  },
  team: {
    id: '00000000-0000-4000-8000-000000000020',
    name: 'Sample Builders',
  },
  checkedInAt: '2026-11-21T18:30:00.000Z',
};

describe('Admin & Check-In Portal Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('CheckInScannerView', () => {
    it('renders scanner input, attendance telemetry, and badge table', async () => {
      vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);

      render(<CheckInScannerView />);

      await waitFor(() => {
        expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
      });

      // Telemetry counters
      expect(screen.getByText('Total Issued Badges')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy(); // total
      expect(screen.getByText('Checked In')).toBeTruthy();
      expect(screen.getAllByText('1').length).toBe(3); // checked in (1), pending (1), revoked (1)
      expect(screen.getAllByText('Pending Entrance').length).toBe(2); // 1 in metric card, 1 in table

      // Table rows
      expect(screen.getByText('Sarra Ben Ahmed')).toBeTruthy();
      expect(screen.getByText('Karim Mansour')).toBeTruthy();
      expect(screen.getByText('Amira Dridi')).toBeTruthy();
    });

    it('scans a badge token successfully and displays confirmation banner', async () => {
      vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);
      const scanSpy = vi.spyOn(api.checkin, 'scanBadge').mockResolvedValue(MOCK_SCAN_RESPONSE);

      render(<CheckInScannerView />);

      await waitFor(() => {
        expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
      });

      const input = screen.getByLabelText(/scan or paste participant qr badge token/i);
      fireEvent.change(input, {
        target: { value: 'TEST-TOKEN-43-CHARS-VALID-FOR-ENTRANCE-12345' },
      });

      const form = input.closest('form');
      expect(form).not.toBeNull();
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(scanSpy).toHaveBeenCalledWith('TEST-TOKEN-43-CHARS-VALID-FOR-ENTRANCE-12345');
        expect(screen.getByText(/Check-In Confirmed/i)).toBeTruthy();
        expect(screen.getAllByText('Karim Mansour').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('surfaces error when badge token scan fails', async () => {
      vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);
      vi.spyOn(api.checkin, 'scanBadge').mockRejectedValue(
        new ApiClientError({
          message: 'Participant has already checked in.',
          status: 409,
          code: 'CONFLICT',
        }),
      );

      render(<CheckInScannerView />);

      await waitFor(() => {
        expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
      });

      const input = screen.getByLabelText(/scan or paste participant qr badge token/i);
      fireEvent.change(input, { target: { value: 'ALREADY-SCANNED-TOKEN' } });

      const form = input.closest('form');
      expect(form).not.toBeNull();
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(screen.getByText(/Check-In Failed/i)).toBeTruthy();
        expect(
          screen.getAllByText(/Participant has already checked in/i).length,
        ).toBeGreaterThanOrEqual(1);
      });
    });

    it('filters badge roster by search query and status tabs', async () => {
      vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);

      render(<CheckInScannerView />);

      await waitFor(() => {
        expect(screen.getByText('Sarra Ben Ahmed')).toBeTruthy();
      });

      // Filter by "Checked In"
      const checkedInTab = screen.getByRole('tab', { name: /checked in \(1\)/i });
      fireEvent.click(checkedInTab);

      expect(screen.getByText('Sarra Ben Ahmed')).toBeTruthy();
      expect(screen.queryByText('Karim Mansour')).toBeNull();

      // Search query
      const searchInput = screen.getByLabelText(/search participant or team name/i);
      fireEvent.change(searchInput, { target: { value: 'Quantum' } });

      expect(screen.getByText('Quantum Coders')).toBeTruthy();
    });

    describe('extractTokenFromQr helper', () => {
      it('extracts token from URL query params ?token= and ?t=', () => {
        expect(extractTokenFromQr('https://liltech.tn/checkin?token=TOKEN-123-PARAM')).toBe(
          'TOKEN-123-PARAM',
        );
        expect(extractTokenFromQr('https://liltech.tn/checkin?t=SHORT-TOKEN-456')).toBe(
          'SHORT-TOKEN-456',
        );
      });

      it('extracts token from URL path segment', () => {
        expect(extractTokenFromQr('https://liltech.tn/badges/BADGE-TOKEN-PATH-789')).toBe(
          'BADGE-TOKEN-PATH-789',
        );
      });

      it('returns plain string when not a formatted URL', () => {
        expect(extractTokenFromQr('PLAIN-RAW-BADGE-TOKEN-VAL')).toBe('PLAIN-RAW-BADGE-TOKEN-VAL');
      });
    });

    describe('Live Camera Scanner', () => {
      let mockMediaDevices: {
        getUserMedia: ReturnType<typeof vi.fn>;
      };
      let mockTrack: { stop: ReturnType<typeof vi.fn> };
      let mockStream: { getTracks: () => (typeof mockTrack)[] };

      beforeEach(() => {
        mockTrack = { stop: vi.fn() };
        mockStream = { getTracks: () => [mockTrack] };
        mockMediaDevices = {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        };
        Object.defineProperty(navigator, 'mediaDevices', {
          value: mockMediaDevices,
          configurable: true,
          writable: true,
        });
      });

      it('activates camera when switched to camera mode and allows stopping it', async () => {
        vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);

        render(<CheckInScannerView />);

        await waitFor(() => {
          expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
        });

        // Switch to camera scanner mode
        const cameraModeBtn = screen.getByRole('button', { name: /live camera scanner/i });
        fireEvent.click(cameraModeBtn);

        await waitFor(() => {
          expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
            video: { facingMode: { ideal: 'environment' } },
          });
          expect(screen.getByText(/Align QR code inside frame/i)).toBeTruthy();
          expect(screen.getByRole('button', { name: /stop camera/i })).toBeTruthy();
          expect(screen.getByRole('button', { name: /close camera/i })).toBeTruthy();
        });

        // Stop camera
        const stopBtn = screen.getByRole('button', { name: /stop camera/i });
        fireEvent.click(stopBtn);

        expect(mockTrack.stop).toHaveBeenCalled();
      });

      it('surfaces accessible error alert when camera permission is denied', async () => {
        vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);
        const deniedErr = new Error('Permission denied');
        deniedErr.name = 'NotAllowedError';
        mockMediaDevices.getUserMedia.mockRejectedValue(deniedErr);

        render(<CheckInScannerView />);

        await waitFor(() => {
          expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
        });

        const cameraModeBtn = screen.getByRole('button', { name: /live camera scanner/i });
        fireEvent.click(cameraModeBtn);

        await waitFor(() => {
          expect(
            screen.getByText(
              /Camera access was denied. Please grant permission in browser settings/i,
            ),
          ).toBeTruthy();
        });
      });

      it('surfaces error alert when no camera device is found', async () => {
        vi.spyOn(api.checkin, 'getBadges').mockResolvedValue(MOCK_BADGES);
        const notFoundErr = new Error('No devices');
        notFoundErr.name = 'NotFoundError';
        mockMediaDevices.getUserMedia.mockRejectedValue(notFoundErr);

        render(<CheckInScannerView />);

        await waitFor(() => {
          expect(screen.getByText('QR Badge Check-In Scanner')).toBeTruthy();
        });

        const cameraModeBtn = screen.getByRole('button', { name: /live camera scanner/i });
        fireEvent.click(cameraModeBtn);

        await waitFor(() => {
          expect(screen.getByText(/No camera device detected on this device/i)).toBeTruthy();
        });
      });
    });
  });

  describe('AdminDashboardView', () => {
    it('renders phase stepper, health telemetry, and audit log', async () => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(MOCK_EVENT_STATE);
      vi.spyOn(api, 'getHealth').mockResolvedValue({
        status: 'ok',
        uptimeSeconds: 120,
        timestamp: '2026-11-21T18:00:00.000Z',
        database: { status: 'up', latencyMs: 2 },
      });
      vi.spyOn(api.admin, 'getAuditLog').mockResolvedValue({
        items: [
          {
            id: 'a1',
            action: 'checkin.scan',
            actorName: 'Admin Organizer',
            createdAt: '2026-11-21T18:15:00.000Z',
          },
        ],
        total: 1,
      });

      render(<AdminDashboardView />);

      await waitFor(() => {
        expect(screen.getByText('Admin Control Panel')).toBeTruthy();
      });

      expect(screen.getByText(/Current Platform Phase/i)).toBeTruthy();
      expect(screen.getAllByText('checkin').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('API & DB: OK (120s uptime)')).toBeTruthy();
      expect(screen.getByText('checkin.scan')).toBeTruthy();
    });

    it('transitions event phase upon confirmation', async () => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(MOCK_EVENT_STATE);
      vi.spyOn(api, 'getHealth').mockResolvedValue({
        status: 'ok',
        uptimeSeconds: 120,
        timestamp: '2026-11-21T18:00:00.000Z',
        database: { status: 'up', latencyMs: 2 },
      });
      vi.spyOn(api.admin, 'getAuditLog').mockResolvedValue({ items: [], total: 0 });

      const updateSpy = vi.spyOn(api.events, 'updatePhase').mockResolvedValue({
        phase: EventPhase.Live,
        serverTime: '2026-11-21T19:00:00.000Z',
        nextPhase: EventPhase.SubmissionsClosed,
        nextPhaseAt: '2026-11-22T08:00:00.000Z',
        phaseLabel: 'Event is live',
      });

      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<AdminDashboardView />);

      await waitFor(() => {
        expect(screen.getByText('Admin Control Panel')).toBeTruthy();
      });

      const advanceBtn = screen.getByRole('button', { name: /advance to live/i });
      fireEvent.click(advanceBtn);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(EventPhase.Live);
        expect(screen.getByText(/Event phase transitioned to LIVE successfully/i)).toBeTruthy();
      });
    });

    it('publishes live announcement and updates stream', async () => {
      vi.spyOn(api.events, 'getEventState').mockResolvedValue(MOCK_EVENT_STATE);
      vi.spyOn(api, 'getHealth').mockResolvedValue({
        status: 'ok',
        uptimeSeconds: 120,
        timestamp: '2026-11-21T18:00:00.000Z',
        database: { status: 'up', latencyMs: 2 },
      });
      vi.spyOn(api.admin, 'getAuditLog').mockResolvedValue({ items: [], total: 0 });

      const publishSpy = vi.spyOn(api.admin, 'publishAnnouncement').mockResolvedValue({
        id: 'ann-1',
        body: 'Dinner is served in Atrium',
        publishedAt: '2026-11-21T21:00:00.000Z',
        authorName: 'Admin Organizer',
      });

      render(<AdminDashboardView />);

      await waitFor(() => {
        expect(screen.getByText('Admin Control Panel')).toBeTruthy();
      });

      const textarea = screen.getByLabelText(/announcement message body/i);
      fireEvent.change(textarea, { target: { value: 'Dinner is served in Atrium' } });

      const publishBtn = screen.getByRole('button', { name: /publish announcement/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(publishSpy).toHaveBeenCalledWith('Dinner is served in Atrium');
        expect(screen.getByText(/Announcement published and broadcast/i)).toBeTruthy();
      });
    });
  });

  describe('RoleGuard for Admin & Check-In Views', () => {
    it('allows access for users with Role.Admin', async () => {
      vi.spyOn(api.auth, 'getSession').mockResolvedValue({
        user: {
          id: 'admin-1',
          name: 'Organizer Staff',
          email: 'admin@liltech.mock',
          role: Role.Admin,
        },
        serverTime: '2026-11-21T18:00:00.000Z',
      });

      render(
        <AuthProvider>
          <RoleGuard allowedRoles={[Role.Admin]}>
            <div>Admin Operations Protected Zone</div>
          </RoleGuard>
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Admin Operations Protected Zone')).toBeTruthy();
      });
    });

    it('blocks access for users with Role.Team', async () => {
      vi.spyOn(api.auth, 'getSession').mockResolvedValue({
        user: {
          id: 'team-1',
          name: 'Team Leader',
          email: 'team@liltech.mock',
          role: Role.Team,
        },
        serverTime: '2026-11-21T18:00:00.000Z',
      });

      render(
        <AuthProvider>
          <RoleGuard allowedRoles={[Role.Admin]}>
            <div>Admin Operations Protected Zone</div>
          </RoleGuard>
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Access restricted/i)).toBeTruthy();
        expect(screen.queryByText('Admin Operations Protected Zone')).toBeNull();
      });
    });
  });
});
