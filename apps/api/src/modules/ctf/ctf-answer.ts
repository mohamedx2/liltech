import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Answer handling for Mini-CTF stages.
 *
 * The plaintext answer never leaves the organizer's material: the database
 * stores `sha256(normalizeAnswer(answer))` and comparison happens here with a
 * constant-time check. Normalization is deliberately forgiving so a player who
 * solved the challenge is not failed by formatting:
 *
 * - surrounding whitespace is ignored
 * - case is ignored
 * - spaces, dashes, dots and other separators are ignored
 * - a flag wrapper such as `L404{...}` or `LILTECH{...}` is unwrapped
 *
 * `187 TUN 4253`, `187tun4253`, `187-tun-4253` and `L404{187TUN4253}` all
 * normalize to `187TUN4253`.
 */

/** `PREFIX{payload}` — the wrapper convention used by the event flags. */
const WRAPPED_FLAG = /^[A-Z][A-Z0-9_]{1,15}\{([^}]*)\}$/;

export function normalizeAnswer(input: string): string {
  const upper = input.trim().toUpperCase();
  const wrapped = WRAPPED_FLAG.exec(upper);
  const body = wrapped?.[1] ?? upper;
  return body.replace(/[^A-Z0-9]/g, '');
}

export function hashAnswer(input: string): string {
  return createHash('sha256').update(normalizeAnswer(input), 'utf8').digest('hex');
}

/**
 * Compares an answer against a stored SHA-256 hex hash in constant time.
 * An empty answer or a malformed stored hash never matches.
 */
export function matchesAnswerHash(input: string, expectedHash: string): boolean {
  const candidate = hashAnswer(input);

  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}
