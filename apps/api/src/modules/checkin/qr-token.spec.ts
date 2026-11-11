import { describe, expect, it } from 'vitest';
import { qrTokenSchema } from 'api-contracts';
import { generateQrToken, hashQrToken } from './qr-token';

describe('qr token material', () => {
  it('generates base64url tokens of at least 128 bits of entropy', () => {
    const { token, tokenHash } = generateQrToken();

    expect(qrTokenSchema.safeParse(token).success).toBe(true);
    expect(tokenHash).toHaveLength(64);
  });

  it('is deterministic when hashing a token', () => {
    const { token } = generateQrToken();

    expect(hashQrToken(token)).toBe(hashQrToken(token));
  });

  it('stores nothing that resembles the raw token', () => {
    const several = Array.from({ length: 20 }, () => generateQrToken());

    for (const item of several) {
      expect(item.tokenHash.length).toBe(64);
      for (const other of several) {
        expect(item.tokenHash.startsWith(other.token)).toBe(false);
      }
    }
  });
});
