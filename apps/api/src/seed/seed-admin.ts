import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../modules/auth/password.service';

/**
 * Optional administrator provisioning for the database seed.
 *
 * Credentials come exclusively from the environment (`SEED_ADMIN_EMAIL`,
 * `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`) — never from source code. When the
 * variables are absent the seed simply skips admin provisioning, so the same
 * seed is safe locally and in production.
 *
 * The operation is idempotent: an existing admin keeps its role and is only
 * touched when the configured password differs (hash reset). An email that
 * already belongs to a non-admin account is rejected instead of hijacked.
 */

export interface SeedAdminConfig {
  email: string;
  password: string;
  name: string;
}

export type SeedAdminStatus = 'created' | 'password_updated' | 'unchanged';

export interface SeedAdminResult {
  status: SeedAdminStatus;
  /** Lowercased email of the provisioned administrator. */
  email: string;
}

/**
 * Password floor matching the canonical registration contract
 * (`createTeamRequestSchema` in `libs/api-contracts`): a slow hash on a short
 * password is pointless.
 */
const SEED_ADMIN_PASSWORD_MIN = 12;

const seedAdminConfigSchema = z.object({
  email: z.email(),
  password: z.string().min(SEED_ADMIN_PASSWORD_MIN),
  name: z.string().trim().min(1),
});

/**
 * Reads the optional admin configuration from an environment-like record.
 * Returns `null` when admin provisioning is not configured (both email and
 * password absent); throws when only one of the two is set or the values are
 * invalid, so misconfiguration fails fast instead of silently skipping.
 */
export function readSeedAdminConfig(
  env: Record<string, string | undefined>,
): SeedAdminConfig | null {
  const email = env.SEED_ADMIN_EMAIL?.trim();
  const password = env.SEED_ADMIN_PASSWORD;
  const name = env.SEED_ADMIN_NAME?.trim();

  if (!email && !password) {
    return null;
  }
  if (!email || !password) {
    throw new Error(
      'Admin seeding misconfigured: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be provided together.',
    );
  }

  const parsed = seedAdminConfigSchema.safeParse({
    email,
    password,
    name: name || 'LilTech Admin',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Admin seeding misconfigured (${issue?.path.join('.') ?? 'config'}): ${
        issue?.message ?? 'invalid values'
      }. The password must be at least ${SEED_ADMIN_PASSWORD_MIN} characters and the email must be valid.`,
    );
  }
  return parsed.data;
}

/**
 * Creates the administrator account if absent, or resets its password hash
 * when the configured password differs. The email is matched case-insensitively.
 */
export async function ensureSeedAdmin(
  prisma: PrismaClient,
  config: SeedAdminConfig,
): Promise<SeedAdminResult> {
  const email = config.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: {
        role: 'admin',
        email,
        name: config.name,
        passwordHash: await hashPassword(config.password),
      },
    });
    return { status: 'created', email };
  }

  if (existing.role !== 'admin') {
    throw new Error(
      `Admin seeding aborted: ${email} already belongs to an existing '${existing.role}' account. Choose a dedicated administrator email instead of taking over an account.`,
    );
  }

  if (await verifyPassword(config.password, existing.passwordHash)) {
    return { status: 'unchanged', email };
  }

  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hashPassword(config.password) },
  });
  return { status: 'password_updated', email };
}
