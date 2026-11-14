import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamProgressState } from 'api-contracts';
import { TeamRegistrationForm } from '../src/features/registration/team-registration-form';
import { api, ApiClientError } from '../src/lib/api';

function completeTeamStep(teamName: string, password: string) {
  fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: teamName } });
  fireEvent.change(screen.getByLabelText(/team account password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

function completeLeaderStep(fullName: string, email: string) {
  fireEvent.change(screen.getByLabelText(/^full name/i), { target: { value: fullName } });
  fireEvent.change(screen.getByLabelText(/^email address/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

function fillMinimumTeammates(
  first: { fullName: string; email: string },
  second: { fullName: string; email: string },
) {
  fireEvent.change(screen.getByLabelText(/teammate 1 full name/i), {
    target: { value: first.fullName },
  });
  fireEvent.change(screen.getByLabelText(/teammate 1 email/i), {
    target: { value: first.email },
  });
  fireEvent.change(screen.getByLabelText(/teammate 2 full name/i), {
    target: { value: second.fullName },
  });
  fireEvent.change(screen.getByLabelText(/teammate 2 email/i), {
    target: { value: second.email },
  });
}

function confirmRegistrationDetails() {
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /i confirm these details are correct/i,
    }),
  );
}

describe('TeamRegistrationForm', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enforces the 3–5 participant team size constraint in roster controls', () => {
    render(<TeamRegistrationForm />);
    completeTeamStep('Alpha Squad', 'secret12345678');
    completeLeaderStep('Amira Ben Ali', 'amira@example.com');

    const addButton = screen.getByRole('button', { name: /add teammate/i }) as HTMLButtonElement;
    expect(
      screen.getByText((_, node) => node?.textContent === 'Total team size: 3 / 5 participants'),
    ).toBeTruthy();

    // Remove buttons disabled at minimum (2 teammates + 1 leader = 3)
    const initialRemoves = screen.getAllByRole('button', { name: /remove teammate/i });
    expect(initialRemoves).toHaveLength(2);
    initialRemoves.forEach((btn) => expect((btn as HTMLButtonElement).disabled).toBe(true));

    // Add up to 4 teammates (total 5 participants)
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(screen.getAllByRole('button', { name: /remove teammate/i })).toHaveLength(4);
    expect(addButton.disabled).toBe(true);
    expect(
      screen.getByText((_, node) => node?.textContent === 'Total team size: 5 / 5 participants'),
    ).toBeTruthy();

    // Remove back down to 3 total participants
    fireEvent.click(screen.getByRole('button', { name: 'Remove teammate 4' }));
    expect(addButton.disabled).toBe(false);
    expect(screen.getAllByRole('button', { name: /remove teammate/i })).toHaveLength(3);
  });

  it('rejects duplicate email addresses across team members and surfaces error summary', () => {
    const registerSpy = vi.spyOn(api.registrations, 'registerTeam');
    render(<TeamRegistrationForm />);

    completeTeamStep('Alpha Squad', 'secret12345678');
    completeLeaderStep('Amira Ben Ali', 'shared@example.com');
    fillMinimumTeammates(
      { fullName: 'Youssef Trabelsi', email: 'shared@example.com' },
      { fullName: 'Salma Gharbi', email: 'salma@example.com' },
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: /every participant on the team must have a unique email address/i,
      }),
    ).toBeTruthy();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('submits valid 3-member team, prevents duplicate submit while pending, and renders success confirmation', async () => {
    let resolveRequest:
      ((value: Awaited<ReturnType<typeof api.registrations.registerTeam>>) => void) | null = null;
    const registerSpy = vi.spyOn(api.registrations, 'registerTeam').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(<TeamRegistrationForm />);

    completeTeamStep('EPI Builders', 'strongpass123');
    completeLeaderStep('Nour Haddad', 'nour@example.com');
    fillMinimumTeammates(
      { fullName: 'Karim Mansour', email: 'karim@example.com' },
      { fullName: 'Ines Khelifi', email: 'ines@example.com' },
    );
    confirmRegistrationDetails();

    const submitButton = screen.getByRole('button', { name: /register team/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledTimes(1);
    });

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
      participantCount: 3,
      createdAt: '2026-11-10T20:00:00.000Z',
      message: 'QR badges queued.',
    });

    await waitFor(() => {
      expect(screen.getByText('Team "EPI Builders" registered')).toBeTruthy();
      expect(screen.getByText(/3 participants recorded/i)).toBeTruthy();
    });
  });

  it('surfaces backend errors clearly when registration fails', async () => {
    vi.spyOn(api.registrations, 'registerTeam').mockRejectedValue(
      new ApiClientError({
        message: 'Team name already exists.',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );

    render(<TeamRegistrationForm />);

    completeTeamStep('Taken Name', 'strongpass123');
    completeLeaderStep('Leader One', 'leader1@example.com');
    fillMinimumTeammates(
      { fullName: 'Member Two', email: 'member2@example.com' },
      { fullName: 'Member Three', email: 'member3@example.com' },
    );
    confirmRegistrationDetails();

    fireEvent.click(screen.getByRole('button', { name: /register team/i }));

    await waitFor(() => {
      expect(screen.getByText('Team name already exists.')).toBeTruthy();
    });
  });
});
