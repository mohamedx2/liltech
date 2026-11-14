import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamProgressState } from 'api-contracts';
import { TeamRegistrationForm } from '../src/features/registration/team-registration-form';
import { api, ApiClientError } from '../src/lib/api';

interface Person {
  fullName: string;
  email: string;
}

const TEAMMATES: Person[] = [
  { fullName: 'Karim Mansour', email: 'karim@example.com' },
  { fullName: 'Ines Khelifi', email: 'ines@example.com' },
  { fullName: 'Sami Jebali', email: 'sami@example.com' },
];

function change(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillForm(teamName: string, leader: Person, teammates: Person[] = TEAMMATES) {
  change(/team name/i, teamName);
  change(/team account password/i, 'strongpass1234');
  change(/leader full name/i, leader.fullName);
  change(/leader email/i, leader.email);
  teammates.forEach((teammate, index) => {
    change(new RegExp(`teammate ${index + 1} full name`, 'i'), teammate.fullName);
    change(new RegExp(`teammate ${index + 1} email`, 'i'), teammate.email);
  });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /register team/i }));
}

describe('TeamRegistrationForm', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows every section on a single page with one submit button', () => {
    render(<TeamRegistrationForm />);

    expect(screen.getByLabelText(/team name/i)).toBeTruthy();
    expect(screen.getByLabelText(/leader full name/i)).toBeTruthy();
    expect(screen.getByLabelText(/teammate 3 full name/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
    expect(screen.getByRole('button', { name: /register team/i })).toBeTruthy();
  });

  it('enforces the 4–7 participant team size in roster controls', () => {
    render(<TeamRegistrationForm />);

    const addButton = screen.getByRole('button', { name: /add teammate/i }) as HTMLButtonElement;
    expect(
      screen.getByText((_, node) => node?.textContent === 'Total team size: 4 / 7 participants'),
    ).toBeTruthy();

    // Minimum: 3 teammates + leader = 4, so removing is disabled.
    const initialRemoves = screen.getAllByRole('button', { name: /remove teammate/i });
    expect(initialRemoves).toHaveLength(3);
    initialRemoves.forEach((btn) => expect((btn as HTMLButtonElement).disabled).toBe(true));

    // Maximum: 6 teammates + leader = 7, so adding is disabled.
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(screen.getAllByRole('button', { name: /remove teammate/i })).toHaveLength(6);
    expect(addButton.disabled).toBe(true);
    expect(
      screen.getByText((_, node) => node?.textContent === 'Total team size: 7 / 7 participants'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove teammate 6' }));
    expect(addButton.disabled).toBe(false);
    expect(screen.getAllByRole('button', { name: /remove teammate/i })).toHaveLength(5);
  });

  it('blocks submission and lists errors when required fields are empty', () => {
    const registerSpy = vi.spyOn(api.registrations, 'registerTeam');
    render(<TeamRegistrationForm />);

    submit();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /team name must be at least 3 characters/i }),
    ).toBeTruthy();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('rejects duplicate email addresses across team members', () => {
    const registerSpy = vi.spyOn(api.registrations, 'registerTeam');
    render(<TeamRegistrationForm />);

    fillForm('Alpha Squad', { fullName: 'Amira Ben Ali', email: 'karim@example.com' });
    submit();

    expect(
      screen.getByRole('link', {
        name: /every participant on the team must have a unique email address/i,
      }),
    ).toBeTruthy();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('submits a valid 4-member team, prevents double submit, and shows confirmation', async () => {
    let resolveRequest:
      ((value: Awaited<ReturnType<typeof api.registrations.registerTeam>>) => void) | null = null;
    const registerSpy = vi.spyOn(api.registrations, 'registerTeam').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(<TeamRegistrationForm />);
    fillForm('EPI Builders', { fullName: 'Nour Haddad', email: 'nour@example.com' });
    submit();

    await waitFor(() => expect(registerSpy).toHaveBeenCalledTimes(1));
    expect(registerSpy.mock.calls[0]?.[0].teammates).toHaveLength(3);

    const pendingButton = screen.getByRole('button', {
      name: /submitting registration…/i,
    }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    fireEvent.click(pendingButton);
    expect(registerSpy).toHaveBeenCalledTimes(1);

    resolveRequest?.({
      teamId: 'team-99',
      teamName: 'EPI Builders',
      status: TeamProgressState.Registered,
      participantCount: 4,
      createdAt: '2026-11-10T20:00:00.000Z',
      message: 'QR badges queued.',
      badges: [],
    });

    await waitFor(() => {
      expect(screen.getByText('Team "EPI Builders" registered')).toBeTruthy();
      expect(screen.getByText(/4 participants recorded/i)).toBeTruthy();
    });
  });

  it('shows every one-time badge code after registration and lets the leader copy them', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const badges = [
      { participantId: 'p-1', participantName: 'Nour Haddad', token: 'a'.repeat(43) },
      { participantId: 'p-2', participantName: 'Karim Mansour', token: 'b'.repeat(43) },
      { participantId: 'p-3', participantName: 'Ines Khelifi', token: 'c'.repeat(43) },
      { participantId: 'p-4', participantName: 'Omar Zouari', token: 'd'.repeat(43) },
    ];
    vi.spyOn(api.registrations, 'registerTeam').mockResolvedValue({
      teamId: 'team-100',
      teamName: 'Badge Builders',
      status: TeamProgressState.Registered,
      participantCount: 4,
      createdAt: '2026-11-10T20:00:00.000Z',
      message: 'Team registered successfully.',
      badges,
    });

    render(<TeamRegistrationForm />);
    fillForm('Badge Builders', { fullName: 'Nour Haddad', email: 'nour@example.com' });
    submit();

    await waitFor(() => {
      expect(screen.getByText(/shown only once/i)).toBeTruthy();
    });
    for (const badge of badges) {
      expect(screen.getByText(badge.token)).toBeTruthy();
    }
    expect(screen.queryByText(/by email\./i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy badge code for Karim Mansour' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('b'.repeat(43)));
    expect(
      screen.getByRole('button', { name: 'Copy badge code for Karim Mansour' }).textContent,
    ).toBe('Copied');
  });

  it('surfaces backend errors clearly when registration fails', async () => {
    vi.spyOn(api.registrations, 'registerTeam').mockRejectedValue(
      new ApiClientError({
        message: 'Team name already exists.',
        status: 409,
        code: 'CONFLICT',
      }),
    );

    render(<TeamRegistrationForm />);
    fillForm('Taken Name', { fullName: 'Leader One', email: 'leader1@example.com' });
    submit();

    await waitFor(() => {
      expect(screen.getByText('Team name already exists.')).toBeTruthy();
    });
  });
});
