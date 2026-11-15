import { describe, expect, it } from 'vitest';
import { hashAnswer, matchesAnswerHash, normalizeAnswer } from './ctf-answer';

/**
 * Stage 1's real answer is never written into this repository. These tests use
 * a throwaway answer that exercises the same normalization rules.
 */
const SAMPLE_ANSWER = '187 TUN 4253';
const SAMPLE_HASH = hashAnswer(SAMPLE_ANSWER);

describe('normalizeAnswer', () => {
  it('ignores case, spaces and separators', () => {
    expect(normalizeAnswer('187 TUN 4253')).toBe('187TUN4253');
    expect(normalizeAnswer('  187tun4253  ')).toBe('187TUN4253');
    expect(normalizeAnswer('187-tun-4253')).toBe('187TUN4253');
    expect(normalizeAnswer('187.tun.4253')).toBe('187TUN4253');
  });

  it('unwraps a flag prefix', () => {
    expect(normalizeAnswer('L404{187TUN4253}')).toBe('187TUN4253');
    expect(normalizeAnswer('liltech{187 tun 4253}')).toBe('187TUN4253');
  });

  it('keeps inner digits intact', () => {
    expect(normalizeAnswer('187 425')).not.toBe(normalizeAnswer('187425300'));
  });
});

describe('hashAnswer', () => {
  it('is stable and 64 hex characters', () => {
    expect(SAMPLE_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAnswer('187TUN4253')).toBe(SAMPLE_HASH);
  });

  it('never contains the plaintext answer', () => {
    expect(SAMPLE_HASH).not.toContain('187');
  });
});

describe('matchesAnswerHash', () => {
  it('accepts every equivalent formatting of the answer', () => {
    for (const variant of ['187 TUN 4253', '187TUN4253', '187-tun-4253', 'L404{187 TUN 4253}']) {
      expect(matchesAnswerHash(variant, SAMPLE_HASH)).toBe(true);
    }
  });

  it('rejects wrong answers and empty input', () => {
    expect(matchesAnswerHash('187 TUN 4254', SAMPLE_HASH)).toBe(false);
    expect(matchesAnswerHash('', SAMPLE_HASH)).toBe(false);
    expect(matchesAnswerHash('   ', SAMPLE_HASH)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(matchesAnswerHash(SAMPLE_ANSWER, 'not-a-hash')).toBe(false);
  });
});
