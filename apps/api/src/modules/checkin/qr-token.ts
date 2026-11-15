import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * QR badge token material — never logged.
 * A token is 32 bytes of CSPRNG output, base64url-encoded (43 characters).
 * Two forms are persisted:
 * - its SHA-256 digest, used to look a badge up at scan time;
 * - an AES-256-GCM ciphertext under a server key (`QR_TOKEN_KEY`), so the
 *   owning team can display its badges again. A database dump without the
 *   key reveals no usable token.
 */

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const CIPHERTEXT_VERSION = 'v1';

export function generateQrToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashQrToken(token) };
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Encrypts a raw token as `v1.<iv>.<auth tag>.<ciphertext>` (base64url parts). */
export function encryptQrToken(token: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [CIPHERTEXT_VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Decrypts a stored token; `null` when it was tampered with or the key changed. */
export function decryptQrToken(stored: string, key: Buffer): string | null {
  const [version, iv, tag, ciphertext] = stored.split('.');

  if (version !== CIPHERTEXT_VERSION || !iv || !tag || !ciphertext) {
    return null;
  }

  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
