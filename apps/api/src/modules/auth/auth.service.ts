import { createHash, randomBytes } from 'node:crypto';
import type { Role } from 'api-contracts';
import { env } from '../../config/env';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { hashPassword, verifyPassword } from './password.service';

/**
 * Session management.
 *
 * Bearer tokens are opaque, high-entropy, single-account credentials. Only
 * their SHA-256 digest is stored, so a database leak cannot be replayed.
 * Sessions expire after `SESSION_TTL_HOURS` and are revoked on logout.
 */

export interface AuthenticatedUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

let dummyHash: Promise<string> | null = null;

/** A bcrypt hash of a random value, computed once, for constant-cost failures. */
function timingDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function issueSession(userId: string): Promise<IssuedSession> {
  const prisma = getPrismaClient();

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

/** Test helper — session issuance without the login endpoint (never exposed over HTTP). */
export function createSessionForUser(userId: string): Promise<IssuedSession> {
  return issueSession(userId);
}

export async function login(
  email: string,
  password: string,
): Promise<IssuedSession & { user: AuthenticatedUser }> {
  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Same generic failure, and the same bcrypt cost, for an unknown email and
  // a wrong password: response timing must not reveal which emails exist.
  if (!user) {
    await verifyPassword(password, await timingDummyHash());
    throw ApiError.unauthorized('Invalid credentials.');
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid credentials.');
  }

  const issued = await issueSession(user.id);

  return {
    ...issued,
    user: { id: user.id, role: user.role, name: user.name, email: user.email },
  };
}

/** Verifies a bearer token; `null` means the token is unknown, revoked, or expired. */
export async function verifySessionToken(token: string): Promise<AuthenticatedUser | null> {
  const prisma = getPrismaClient();

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
}

export async function revokeSession(token: string): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Administrative convenience used by tests; not exposed over HTTP. */
export async function createUser(input: {
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
}): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({ data: input });
  return { id: user.id };
}
