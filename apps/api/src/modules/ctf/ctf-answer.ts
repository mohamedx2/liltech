import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Answer handling for the LOUAGE 404 Mini-CTF.
 *
 * Answers are never stored or compared in plaintext. The database holds
 * `HMAC-SHA256(normalizeAnswer(answer), CTF_ANSWER_PEPPER)`; the pepper is a
 * server-only secret, so a database dump alone cannot be brute-forced offline
 * against the low-entropy flags this event uses.
 *
 * Normalization is deliberately forgiving so a team that solved the challenge
 * is not failed by formatting:
 *
 * - Unicode NFC, so composed and decomposed Arabic forms compare equal
 * - surrounding whitespace ignored, inner whitespace and separators ignored
 * - case ignored
 * - a flag wrapper such as `L404{...}` or `LILTECH{...}` is unwrapped
 * - apostrophes are preserved (`you're` != `youre`) and normalized to `'`
 */

const WRAPPED_FLAG = /^([A-Za-z0-9_]{2,16})\{([\s\S]*)\}$/;

/** Everything that is not a letter (any script), a digit, or an apostrophe. */
const NON_ANSWER_CHARACTER = /[^\p{L}\p{N}']/gu;

const CURLY_APOSTROPHE = /[\u2018\u2019\u02BC\u2032]/g;

export const CTF_PEPPER_ENV = 'CTF_ANSWER_PEPPER';

/** Returns the server-only pepper that was validated during process startup. */
export function getAnswerPepper(): string {
  return env.CTF_ANSWER_PEPPER;
}

export function normalizeAnswer(input: string): string {
  const normalized = input.normalize('NFC').trim();
  const wrapped = WRAPPED_FLAG.exec(normalized);
  const body = wrapped ? wrapped[2] : normalized;

  return body.replace(CURLY_APOSTROPHE, "'").toLowerCase().replace(NON_ANSWER_CHARACTER, '');
}

/**
 * Keyed digest of the normalized answer. `pepper` is injectable for tests and
 * provisioning; request paths must rely on the environment value.
 */
export function hashAnswer(input: string, pepper: string = getAnswerPepper()): string {
  return createHmac('sha256', pepper).update(normalizeAnswer(input), 'utf8').digest('hex');
}

/**
 * Constant-time comparison against a stored digest. An empty answer, a missing
 * digest (unconfigured stage) or a malformed digest never matches.
 */
export function matchesAnswerHash(
  input: string,
  expectedHash: string | null,
  pepper: string = getAnswerPepper(),
): boolean {
  if (!expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    return false;
  }

  const candidate = Buffer.from(hashAnswer(input, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}
