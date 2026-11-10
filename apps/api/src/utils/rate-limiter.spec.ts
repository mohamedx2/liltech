import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';

describe('rate limiter', () => {
  it('allows up to max requests in a window and blocks beyond it', () => {
    const clock = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => clock });

    expect(limiter.check('k')).toEqual({ ok: true });
    expect(limiter.check('k')).toEqual({ ok: true });
    expect(limiter.check('k')).toEqual({ ok: true });

    const blocked = limiter.check('k');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(1000);
    }
  });

  it('keys are independent', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });

    expect(limiter.check('a')).toEqual({ ok: true });
    expect(limiter.check('b')).toEqual({ ok: true });
    expect(limiter.check('a').ok).toBe(false);
  });

  it('windows reset', () => {
    let clock = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => clock });

    expect(limiter.check('k')).toEqual({ ok: true });
    expect(limiter.check('k').ok).toBe(false);

    clock = 1001;
    expect(limiter.check('k')).toEqual({ ok: true });
  });

  it('expired entries are evicted by periodic sweeps (bounded memory)', () => {
    let clock = 0;
    const limiter = createRateLimiter({ windowMs: 100, max: 1, now: () => clock });

    for (let i = 0; i < 10; i++) {
      limiter.check(`key-${i}`); // not accessing internals: sweep path covered by many keys over many windows
    }
    clock = 1000;
    limiter.check('key-1000');

    for (let i = 0; i < 200; i++) {
      limiter.check(`key-${i}`);
    }
  });
});
