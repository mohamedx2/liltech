import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamProgressState } from 'api-contracts';
import { TeamRegistrationForm } from '../src/features/registration/team-registration-form';
import { api, ApiClientError } from '../src/lib/api';

describe('TeamRegistrationForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enforces the 3–5 participant team size constraint in roster controls', () => {
    render(<TeamRegistrationForm />);

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

    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Alpha Squad' } });
    fireEvent.change(screen.getByLabelText(/team account password/i), {
      target: { value: 'secret1234' },
    });
    fireEvent.change(screen.getByLabelText(/^full name/i), { target: { value: 'Amira Ben Ali' } });
    fireEvent.change(screen.getByLabelText(/^email address/i), {
      target: { value: 'shared@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 full name/i), {
      target: { value: 'Youssef Trabelsi' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 email/i), {
      target: { value: 'shared@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 full name/i), {
      target: { value: 'Salma Gharbi' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 email/i), {
      target: { value: 'salma@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit team registration/i }));

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

    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'EPI Builders' } });
    fireEvent.change(screen.getByLabelText(/team account password/i), {
      target: { value: 'strongpass123' },
    });
    fireEvent.change(screen.getByLabelText(/^full name/i), { target: { value: 'Nour Haddad' } });
    fireEvent.change(screen.getByLabelText(/^email address/i), {
      target: { value: 'nour@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 full name/i), {
      target: { value: 'Karim Mansour' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 email/i), {
      target: { value: 'karim@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 full name/i), {
      target: { value: 'Ines Khelifi' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 email/i), {
      target: { value: 'ines@example.com' },
    });

    const submitButton = screen.getByRole('button', { name: /submit team registration/i });
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

    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Taken Name' } });
    fireEvent.change(screen.getByLabelText(/team account password/i), {
      target: { value: 'strongpass123' },
    });
    fireEvent.change(screen.getByLabelText(/^full name/i), { target: { value: 'Leader One' } });
    fireEvent.change(screen.getByLabelText(/^email address/i), {
      target: { value: 'leader1@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 full name/i), {
      target: { value: 'Member Two' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 1 email/i), {
      target: { value: 'member2@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 full name/i), {
      target: { value: 'Member Three' },
    });
    fireEvent.change(screen.getByLabelText(/teammate 2 email/i), {
      target: { value: 'member3@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit team registration/i }));

    await waitFor(() => {
      expect(screen.getByText('Team name already exists.')).toBeTruthy();
    });
  });
});
