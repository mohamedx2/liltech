import { describe, it, expect } from 'vitest';
import { nowIso, parseIsoTimestamp, toIsoTimestamp } from './time.js';
import { assertNever } from './assert-never.js';

describe('time', () => {
  it('formats dates as ISO 8601 UTC', () => {
    const date = new Date('2026-11-21T20:00:00Z');
    expect(toIsoTimestamp(date)).toBe('2026-11-21T20:00:00.000Z');
  });

  it('parses valid ISO timestamps and rejects invalid ones', () => {
    expect(parseIsoTimestamp('2026-11-21T20:00:00.000Z')?.toISOString()).toBe(
      '2026-11-21T20:00:00.000Z',
    );
    expect(parseIsoTimestamp('not-a-date')).toBeNull();
  });

  it('returns server-time-shaped strings from nowIso', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('assertNever', () => {
  it('throws for unexpected values at runtime', () => {
    // Only reachable at runtime for untyped values; verifies the guard works.
    const bad = 'oops' as never;
    expect(() => assertNever(bad, 'phase')).toThrow('Unexpected phase');
  });
});
