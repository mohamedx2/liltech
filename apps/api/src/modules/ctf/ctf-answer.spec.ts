import { describe, expect, it } from 'vitest';
import {
  hashAnswer,
  matchesAnswerHash,
  normalizeAnswer,
  CtfPepperMissingError,
} from './ctf-answer';

/**
 * Test-only answers. The real LOUAGE 404 flags are never written into this
 * repository or into fixtures — these strings exercise the same rules
 * (wrapper, separators, apostrophe, Arabic) without revealing anything.
 */
const PEPPER = 'unit-test-pepper-not-a-secret-32ch';
const OTHER_PEPPER = 'a-completely-different-test-pepper';

const PLAIN_ANSWER = '999 TUN 0000';
const PLAIN_HASH = hashAnswer(PLAIN_ANSWER, PEPPER);

describe('normalizeAnswer', () => {
  it('ignores case, spaces and separators', () => {
    expect(normalizeAnswer('999 TUN 0000')).toBe('999tun0000');
    expect(normalizeAnswer('  999tun0000  ')).toBe('999tun0000');
    expect(normalizeAnswer('999-tun-0000')).toBe('999tun0000');
    expect(normalizeAnswer('999.tun.0000')).toBe('999tun0000');
    expect(normalizeAnswer('999_tun_0000')).toBe('999tun0000');
  });

  it('unwraps any flag prefix, not just one', () => {
    expect(normalizeAnswer('L404{999TUN0000}')).toBe('999tun0000');
    expect(normalizeAnswer('LILTECH{999 tun 0000}')).toBe('999tun0000');
  });

  it('keeps a time-style answer and drops the colon', () => {
    expect(normalizeAnswer('L404{06:15}')).toBe('0615');
    expect(normalizeAnswer('0615')).toBe('0615');
  });

  it('preserves the apostrophe, which carries meaning', () => {
    expect(normalizeAnswer("L404{you're_missing}")).toBe("you'remissing");
    expect(normalizeAnswer('L404{youre_missing}')).not.toBe(
      normalizeAnswer("L404{you're_missing}"),
    );
  });

  it('normalizes curly apostrophes to a straight one', () => {
    expect(normalizeAnswer('L404{you\u2019re_missing}')).toBe(
      normalizeAnswer("L404{you're_missing}"),
    );
  });

  it('supports Arabic and keeps every letter', () => {
    const arabic = 'يا مرحبا بيك في تونس';
    const normalized = normalizeAnswer(`L404{${arabic}}`);

    expect(normalized).toBe(normalizeAnswer(arabic));
    expect(normalized).not.toContain(' ');
    expect(normalized.startsWith('يا')).toBe(true);
    expect(normalized.endsWith('تونس')).toBe(true);
    expect(normalizeAnswer('L404{يا  مرحبا بيك في تونس}')).toBe(normalized);
    expect(normalizeAnswer('يا-مرحبا-بيك-في-تونس')).toBe(normalized);
  });

  it('normalizes decomposed Arabic to the same value as composed (NFC)', () => {
    const composed = 'أ';
    const decomposed = composed.normalize('NFD');

    expect(composed).not.toBe(decomposed);
    expect(normalizeAnswer(decomposed)).toBe(normalizeAnswer(composed));
  });

  it('does not turn unrelated strings into an answer', () => {
    expect(normalizeAnswer('999 TUN 0001')).not.toBe(normalizeAnswer(PLAIN_ANSWER));
    expect(normalizeAnswer('')).toBe('');
    expect(normalizeAnswer('   ')).toBe('');
    expect(normalizeAnswer('---')).toBe('');
  });
});

describe('hashAnswer', () => {
  const hash = hashAnswer(PLAIN_ANSWER, PEPPER);

  it('produces a 64-character hex digest', () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for equivalent formatting', () => {
    expect(hashAnswer('999-tun-0000', PEPPER)).toBe(hash);
    expect(hashAnswer('L404{999 TUN 0000}', PEPPER)).toBe(hash);
  });

  it('depends on the pepper', () => {
    expect(hashAnswer(PLAIN_ANSWER, OTHER_PEPPER)).not.toBe(hash);
  });

  it('rejects a pepper that is too short to matter', () => {
    const original = process.env.CTF_ANSWER_PEPPER;
    process.env.CTF_ANSWER_PEPPER = 'short';

    try {
      expect(() => hashAnswer(PLAIN_ANSWER)).toThrow(CtfPepperMissingError);
    } finally {
      if (original === undefined) {
        delete process.env.CTF_ANSWER_PEPPER;
      } else {
        process.env.CTF_ANSWER_PEPPER = original;
      }
    }
  });

  it('fails loudly without a configured pepper', () => {
    const original = process.env.CTF_ANSWER_PEPPER;
    delete process.env.CTF_ANSWER_PEPPER;

    try {
      expect(() => hashAnswer(PLAIN_ANSWER)).toThrow(CtfPepperMissingError);
    } finally {
      if (original !== undefined) {
        process.env.CTF_ANSWER_PEPPER = original;
      }
    }
  });
});

describe('matchesAnswerHash', () => {
  it('accepts every permitted formatting of the answer', () => {
    for (const variant of [PLAIN_ANSWER, '999tun0000', '999-tun-0000', 'L404{999 TUN 0000}']) {
      expect(matchesAnswerHash(variant, PLAIN_HASH, PEPPER)).toBe(true);
    }
  });

  it('accepts the inner answer as well as the wrapped flag', () => {
    expect(matchesAnswerHash('L404{999TUN0000}', PLAIN_HASH, PEPPER)).toBe(true);
    expect(matchesAnswerHash('999TUN0000', PLAIN_HASH, PEPPER)).toBe(true);
  });

  it('rejects wrong answers and empty input', () => {
    expect(matchesAnswerHash('999 TUN 0001', PLAIN_HASH, PEPPER)).toBe(false);
    expect(matchesAnswerHash('', PLAIN_HASH, PEPPER)).toBe(false);
    expect(matchesAnswerHash('   ', PLAIN_HASH, PEPPER)).toBe(false);
  });

  it('never matches an unconfigured or malformed digest', () => {
    expect(matchesAnswerHash(PLAIN_ANSWER, null, PEPPER)).toBe(false);
    expect(matchesAnswerHash(PLAIN_ANSWER, '', PEPPER)).toBe(false);
    expect(matchesAnswerHash(PLAIN_ANSWER, 'not-a-hash', PEPPER)).toBe(false);
  });
});
