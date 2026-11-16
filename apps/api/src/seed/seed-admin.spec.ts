import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../modules/auth/password.service';
import { createUser } from '../modules/auth/auth.service';
import { ensureSeedAdmin, readSeedAdminConfig } from './seed-admin';
import {
  destroyIntegrationDatabase,
  INTEGRATION_DB_AVAILABLE,
  initIntegrationDatabase,
  resetIntegrationDatabase,
} from '../tests/test-database';

/**
 * Integration tests for the optional administrator provisioning performed by
 * the seed script (`prisma/seed.ts`).
 *
 * Runs against the isolated test database (TEST_DATABASE_URL); skips entirely
 * when no test database is provided so the default suite stays DB-free.
 */

const describeDb = INTEGRATION_DB_AVAILABLE() ? describe : describe.skip;

const ADMIN_EMAIL = 'seed-admin@test.local';
const ADMIN_PASSWORD = 'seed-admin-password-2026';

describeDb('seed admin provisioning', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await initIntegrationDatabase();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase();
  });

  afterAll(async () => {
    await destroyIntegrationDatabase();
  });

  it('creates the administrator with a verifiable bcrypt hash', async () => {
    const result = await ensureSeedAdmin(prisma, {
      email: ADMIN_EMAIL.toUpperCase(),
      password: ADMIN_PASSWORD,
      name: 'Seeded Admin',
    });

    expect(result.status).toBe('created');
    expect(result.email).toBe(ADMIN_EMAIL);

    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) {
      throw new Error('Seeded administrator not found.');
    }
    expect(user.role).toBe('admin');
    expect(user.name).toBe('Seeded Admin');
    expect(user.passwordHash).not.toContain(ADMIN_PASSWORD);
    expect(await verifyPassword(ADMIN_PASSWORD, user.passwordHash)).toBe(true);
  });

  it('is idempotent: a repeated run leaves the account unchanged', async () => {
    await ensureSeedAdmin(prisma, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Seeded Admin',
    });

    const result = await ensureSeedAdmin(prisma, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Seeded Admin',
    });

    expect(result.status).toBe('unchanged');
    expect(await prisma.user.count({ where: { email: ADMIN_EMAIL } })).toBe(1);
  });

  it('resets the password hash when the configured password differs', async () => {
    await ensureSeedAdmin(prisma, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Seeded Admin',
    });

    const newPassword = 'rotated-password-2026';
    const result = await ensureSeedAdmin(prisma, {
      email: ADMIN_EMAIL,
      password: newPassword,
      name: 'Seeded Admin',
    });

    expect(result.status).toBe('password_updated');
    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) {
      throw new Error('Seeded administrator not found.');
    }
    expect(await verifyPassword(newPassword, user.passwordHash)).toBe(true);
    expect(await verifyPassword(ADMIN_PASSWORD, user.passwordHash)).toBe(false);
  });

  it('refuses to take over an existing non-admin account', async () => {
    await createUser({
      role: 'team',
      name: 'Existing Leader',
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword('leader-password-2026'),
    });

    await expect(
      ensureSeedAdmin(prisma, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: 'Seeded Admin',
      }),
    ).rejects.toThrow(/already belongs to an existing 'team' account/);

    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) {
      throw new Error('Existing team account not found.');
    }
    expect(user.role).toBe('team');
  });

  describe('readSeedAdminConfig', () => {
    it('returns null when no admin variables are configured', () => {
      expect(readSeedAdminConfig({})).toBeNull();
    });

    it('throws when only one of email or password is provided', () => {
      expect(() => readSeedAdminConfig({ SEED_ADMIN_EMAIL: ADMIN_EMAIL })).toThrow(
        /provided together/,
      );
      expect(() => readSeedAdminConfig({ SEED_ADMIN_PASSWORD: ADMIN_PASSWORD })).toThrow(
        /provided together/,
      );
    });

    it('rejects a password below the canonical 12-character floor', () => {
      expect(() =>
        readSeedAdminConfig({ SEED_ADMIN_EMAIL: ADMIN_EMAIL, SEED_ADMIN_PASSWORD: 'short' }),
      ).toThrow(/at least 12 characters/);
    });

    it('rejects an invalid email and applies the default name', () => {
      expect(() =>
        readSeedAdminConfig({
          SEED_ADMIN_EMAIL: 'not-an-email',
          SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
        }),
      ).toThrow(/Admin seeding misconfigured/);

      expect(
        readSeedAdminConfig({ SEED_ADMIN_EMAIL: ADMIN_EMAIL, SEED_ADMIN_PASSWORD: ADMIN_PASSWORD }),
      ).toEqual({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: 'LilTech Admin',
      });
    });
  });
});
