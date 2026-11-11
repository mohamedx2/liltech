import bcrypt from 'bcryptjs';

/**
 * Password hashing: bcrypt with a deliberately slow cost factor and per-user
 * salt (generated internally by bcrypt). Hashes are never logged or returned.
 */

const BCRYPT_COST = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
