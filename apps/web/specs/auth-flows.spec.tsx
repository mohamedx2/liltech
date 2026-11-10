import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChallengeTrack, Role } from 'api-contracts';
import { RoleGuard } from '../src/components/auth/role-guard';
import { LoginForm } from '../src/features/auth/login-form';
import { api, ApiClientError } from '../src/lib/api';
import { AuthProvider } from '../src/lib/auth/session';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/login',
}));

describe('Auth flows and RoleGuard', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows accessible error summary and toggles password visibility on LoginForm', async () => {
    vi.spyOn(api.auth, 'getSession').mockResolvedValue({
      user: null,
      serverTime: '2026-11-21T18:00:00.000Z',
    });

    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /enter a valid email address/i }).getAttribute('href'),
    ).toBe('#login-email');
    expect(screen.getByRole('link', { name: /enter your password/i }).getAttribute('href')).toBe(
      '#login-password',
    );

    const passwordInput = screen.getByLabelText(/^password/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    expect(
      screen.getByRole('button', { name: /hide password/i }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('routes authenticated users to their role portal on successful sign-in', async () => {
    vi.spyOn(api.auth, 'getSession').mockResolvedValue({
      user: null,
      serverTime: '2026-11-21T18:00:00.000Z',
    });
    vi.spyOn(api.auth, 'login').mockResolvedValue({
      user: {
        id: 'jury-1',
        name: 'Jury Member',
        email: 'jury@example.com',
        role: Role.Jury,
        assignedTrack: ChallengeTrack.TrackB,
      },
    });

    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'jury@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'strong-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/jury');
    });
  });

  it('renders specific rate-limit error feedback on HTTP 429 from LoginForm', async () => {
    vi.spyOn(api.auth, 'getSession').mockResolvedValue({
      user: null,
      serverTime: '2026-11-21T18:00:00.000Z',
    });
    vi.spyOn(api.auth, 'login').mockRejectedValue(
      new ApiClientError({
        message: 'Too many requests',
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );

    render(
      <AuthProvider>
        <LoginForm />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'team@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many sign-in attempts/i)).toBeTruthy();
    });
  });

  it('gates RoleGuard children by server-verified user role', async () => {
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
        <RoleGuard allowedRoles={[Role.Admin]}>
          <p>Admin secret view</p>
        </RoleGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/access restricted/i)).toBeTruthy();
    });
    expect(screen.queryByText('Admin secret view')).toBeNull();
    expect(screen.getByRole('link', { name: /go to your workspace/i }).getAttribute('href')).toBe(
      '/team',
    );
  });

  it('renders RoleGuard children when user holds an allowed role', async () => {
    vi.spyOn(api.auth, 'getSession').mockResolvedValue({
      user: {
        id: 'admin-1',
        name: 'Admin Account',
        email: 'admin@example.com',
        role: Role.Admin,
      },
      serverTime: '2026-11-21T18:00:00.000Z',
    });

    render(
      <AuthProvider>
        <RoleGuard allowedRoles={[Role.Admin]}>
          <p>Admin portal content</p>
        </RoleGuard>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Admin portal content')).toBeTruthy();
    });
  });
});
