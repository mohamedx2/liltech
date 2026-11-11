/**
 * Server-side fixed-window rate limiter.
 *
 * Slow and correct is the point: the event is short, the API is single-instance,
 * and the endpoints that need this (login, later flag submission) require a
 * counter that cannot be reset by clients. Keys are caller-supplied
 * (e.g. `ip|route`); memory is bounded via periodic full entry expiry.
 */
export interface RateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests accepted per key per window. */
  max: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export type RateLimiter = {
  readonly check: (key: string) => { ok: true } | { ok: false; retryAfterMs: number };
};

type Entry = { count: number; windowStart: number };

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();
  let lastSweepAt = now();

  function sweep(currentTime: number): void {
    for (const [key, entry] of entries) {
      if (currentTime - entry.windowStart >= options.windowMs) {
        entries.delete(key);
      }
    }
    lastSweepAt = currentTime;
  }

  return {
    check(key) {
      const currentTime = now();

      // Bounded-memory sweep at most once per window.
      if (currentTime - lastSweepAt >= options.windowMs) {
        sweep(currentTime);
      }

      const entry = entries.get(key);

      if (!entry || currentTime - entry.windowStart >= options.windowMs) {
        entries.set(key, { count: 1, windowStart: currentTime });
        return { ok: true };
      }

      if (entry.count >= options.max) {
        const retryAfterMs = entry.windowStart + options.windowMs - currentTime;
        return { ok: false, retryAfterMs };
      }

      entry.count++;
      return { ok: true };
    },
  };
}
