import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { EventPhase, Role } from 'api-contracts';
import HomePage from '../src/app/(public)/page';
import SchedulePage from '../src/app/(public)/schedule/page';
import ChallengesPage from '../src/app/(public)/challenges/page';
import { api, ApiClientError } from '../src/lib/api';
import { AuthProvider } from '../src/lib/auth/session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Public pages', () => {
  beforeEach(() => {
    vi.spyOn(api.auth, 'getSession').mockResolvedValue({
      user: {
        id: 'u-1',
        name: 'Team Leader',
        email: 'team@liltech.mock',
        role: Role.Team,
      },
      serverTime: '2026-11-21T18:00:00.000Z',
    });

    vi.spyOn(api, 'getHealth').mockResolvedValue({
      status: 'ok',
      uptimeSeconds: 120,
      timestamp: '2026-11-21T18:00:00.000Z',
      database: { status: 'up', latencyMs: 3 },
    });

    vi.spyOn(api.events, 'getEventState').mockResolvedValue({
      phase: EventPhase.Registration,
      serverTime: '2026-11-21T18:00:00.000Z',
      nextPhase: EventPhase.Live,
      nextPhaseAt: '2026-11-21T19:00:00.000Z',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the public landing page with hero heading, workflow, tracks, and health status', async () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /one night\. two challenges\. one platform to run it all\./i,
      }),
    ).toBeTruthy();

    expect(screen.getByRole('link', { name: /register a team/i }).getAttribute('href')).toBe(
      '/register',
    );
    expect(screen.getByRole('link', { name: /view event schedule/i }).getAttribute('href')).toBe(
      '/schedule',
    );
    expect(screen.getByRole('link', { name: /^sign in$/i }).getAttribute('href')).toBe('/login');
    expect(screen.getByText('Challenge Track A')).toBeTruthy();
    expect(screen.getByText('Challenge Track B')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/platform online — database connected/i)).toBeTruthy();
      expect(screen.getByText(/registration open/i)).toBeTruthy();
    });
  });

  it('renders the event schedule timeline and progression states cleanly when event-state API returns 404', async () => {
    vi.spyOn(api.events, 'getEventState').mockRejectedValue(
      new ApiClientError({
        message: 'Not implemented yet',
        status: 404,
        code: 'NOT_FOUND',
      }),
    );

    render(<SchedulePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /overnight schedule & canonical phases/i }),
    ).toBeTruthy();
    expect(screen.getByText(/nov 21 · 20:00/i)).toBeTruthy();
    expect(screen.getByText(/nov 22 · 08:00/i)).toBeTruthy();
    expect(screen.getByText(/nov 22 · 09:00/i)).toBeTruthy();
    expect(screen.getByText(/nov 22 · 11:00/i)).toBeTruthy();
    expect(screen.getByText('ctf_unlocked')).toBeTruthy();
    expect(screen.getByText('submitted')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/event state pending api/i)).toBeTruthy();
    });
  });

  it('renders the public challenge tracks page without inventing answers to open questions', () => {
    render(<ChallengesPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /challenge tracks & mini-ctf unlock gate/i }),
    ).toBeTruthy();
    expect(screen.getByText('Track A')).toBeTruthy();
    expect(screen.getByText('Track B')).toBeTruthy();
    expect(screen.getByText(/open organizer specifications/i)).toBeTruthy();
  });
});
