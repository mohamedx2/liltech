import { describe, expect, it } from 'vitest';
import { qrTokenSchema } from 'api-contracts';
import { randomBytes } from 'node:crypto';
import { decryptQrToken, encryptQrToken, generateQrToken, hashQrToken } from './qr-token';

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

  it('round-trips a token through encryption and never stores it in clear', () => {
    const key = randomBytes(32);
    const { token } = generateQrToken();

    const stored = encryptQrToken(token, key);

    expect(stored).not.toContain(token);
    expect(stored.length).toBeLessThanOrEqual(255);
    expect(decryptQrToken(stored, key)).toBe(token);
    // A fresh IV each time: the same token never encrypts to the same value.
    expect(encryptQrToken(token, key)).not.toBe(stored);
  });

  it('refuses tampered ciphertext and the wrong key', () => {
    const key = randomBytes(32);
    const stored = encryptQrToken(generateQrToken().token, key);
    const parts = stored.split('.');
    const flipped = parts[3].startsWith('A') ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;

    expect(decryptQrToken([...parts.slice(0, 3), flipped].join('.'), key)).toBeNull();
    expect(decryptQrToken(stored, randomBytes(32))).toBeNull();
    expect(decryptQrToken('garbage', key)).toBeNull();
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
