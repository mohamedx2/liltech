import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { calculateCountdown, ServerCountdown } from '../src/components/events/server-countdown';

describe('ServerCountdown', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('computes countdown components cleanly and reports expiration at or past target', () => {
    const base = Date.parse('2026-11-21T19:00:00.000Z');
    const target = Date.parse('2026-11-22T20:01:05.000Z'); // 1d 1h 1m 5s

    expect(calculateCountdown(base, target)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 5,
      isExpired: false,
    });

    expect(calculateCountdown(target + 1000, target)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
    });
  });

  it('ticks relative to authoritative server time even when client wall clock is skewed', () => {
    vi.useFakeTimers();
    // Simulate a participant phone clock set 5 hours in the future
    vi.setSystemTime(new Date('2026-11-22T00:00:00.000Z'));

    render(
      <ServerCountdown
        serverTime="2026-11-21T18:59:55.000Z"
        targetTime="2026-11-21T19:00:00.000Z"
        label="Kickoff in"
        expiredLabel="Event live"
      />,
    );

    expect(screen.getByLabelText('Kickoff in: 0d 0h 0m 5s')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByLabelText('Kickoff in: 0d 0h 0m 3s')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Event live')).toBeTruthy();
  });
});
