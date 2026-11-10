import { createHash, randomBytes } from 'node:crypto';

/**
 * QR badge token material — never persisted in raw form and never logged.
 * A token is 32 bytes of CSPRNG output, base64url-encoded (43 characters);
 * only its SHA-256 digest is stored, keeping database leaks unreplayable.
 */

export function generateQrToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashQrToken(token) };
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
