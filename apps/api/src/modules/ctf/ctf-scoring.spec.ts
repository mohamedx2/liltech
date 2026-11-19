import { describe, expect, it } from 'vitest';
import {
  CTF_SCORING_BANDS,
  CTF_WINDOW_MS,
  ctfClosesAt,
  ctfPointsForElapsed,
  ctfPointsSince,
} from './ctf-scoring';

/**
 * Scoring boundaries: the window is [0, 15) → 10, [15, 30) → 7,
 * [30, 45) → 4.5, [45, 60) → 2.5, [60, ∞) → 0.
 */

const MINUTE = 60_000;

describe('ctfPointsForElapsed', () => {
  it('scores the whole first window at 10 points', () => {
    expect(ctfPointsForElapsed(0)).toBe(10);
    expect(ctfPointsForElapsed(1)).toBe(10);
    expect(ctfPointsForElapsed(14 * MINUTE)).toBe(10);
  });

  it('moves to 7 points at exactly 15:00 and one millisecond before 30:00', () => {
    expect(ctfPointsForElapsed(15 * MINUTE - 1)).toBe(10);
    expect(ctfPointsForElapsed(15 * MINUTE)).toBe(7);
    expect(ctfPointsForElapsed(29 * MINUTE + 59_999)).toBe(7);
  });

  it('moves to 4.5 points at exactly 30:00 and one millisecond before 45:00', () => {
    expect(ctfPointsForElapsed(30 * MINUTE)).toBe(4.5);
    expect(ctfPointsForElapsed(44 * MINUTE + 59_999)).toBe(4.5);
  });

  it('moves to 2.5 points at exactly 45:00 and one millisecond before 60:00', () => {
    expect(ctfPointsForElapsed(45 * MINUTE)).toBe(2.5);
    expect(ctfPointsForElapsed(60 * MINUTE - 1)).toBe(2.5);
  });

  it('scores 0 at exactly 60:00 and after the window', () => {
    expect(ctfPointsForElapsed(60 * MINUTE)).toBe(0);
    expect(ctfPointsForElapsed(CTF_WINDOW_MS + 1)).toBe(0);
    expect(ctfPointsForElapsed(10 * 60 * MINUTE)).toBe(0);
  });

  it('treats a negative elapsed time as an instant solve and non-finite input as 0', () => {
    expect(ctfPointsForElapsed(-1)).toBe(10);
    expect(ctfPointsForElapsed(Number.NaN)).toBe(0);
    expect(ctfPointsForElapsed(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('uses descending windows so a slower solve never scores more', () => {
    const points = CTF_SCORING_BANDS.map((band) => band.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });
});

describe('ctfPointsSince', () => {
  const startedAt = new Date('2026-11-21T20:00:00.000Z');

  it('measures from the server launch instant to the final flag', () => {
    expect(ctfPointsSince(startedAt, new Date('2026-11-21T20:10:00.000Z'))).toBe(10);
    expect(ctfPointsSince(startedAt, new Date('2026-11-21T20:20:00.000Z'))).toBe(7);
    expect(ctfPointsSince(startedAt, new Date('2026-11-21T20:40:00.000Z'))).toBe(4.5);
    expect(ctfPointsSince(startedAt, new Date('2026-11-21T20:50:00.000Z'))).toBe(2.5);
    expect(ctfPointsSince(startedAt, new Date('2026-11-21T21:00:00.000Z'))).toBe(0);
  });

  it('closes exactly 60 minutes after the launch', () => {
    expect(ctfClosesAt(startedAt).toISOString()).toBe('2026-11-21T21:00:00.000Z');
  });
});
