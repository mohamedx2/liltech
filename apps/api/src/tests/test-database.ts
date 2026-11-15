import type { PrismaClient } from '@prisma/client';

/**
 * Integration-test helpers.
 *
 * These tests run against a real, isolated test database pointed to by
 * `TEST_DATABASE_URL` (see `docs/backend/DEVELOPMENT.md`). Locally the variable
 * is optional so a quick database-free run stays green; in CI it is mandatory,
 * and a missing value fails the suite instead of silently skipping coverage.
 *
 * The client here is used only by tests; the services under test go through
 * `getPrismaClient` against the same `DATABASE_URL`.
 */

export function INTEGRATION_DB_AVAILABLE(): boolean {
  const configured = Boolean(process.env.TEST_DATABASE_URL);

  if (!configured && process.env.CI) {
    throw new Error(
      'TEST_DATABASE_URL is required in CI: integration tests must not be skipped. ' +
        'Provision the test Postgres service and export the variable (see .github/workflows/ci.yml).',
    );
  }

  return configured;
}

let prisma: PrismaClient | null = null;

export async function resetIntegrationDatabase(): Promise<void> {
  if (!prisma) {
    throw new Error('Integration test database not initialized.');
  }
  await prisma.$transaction([
    // CTF first: stages cascade to hints, progress and attempts, and deleting
    // them keeps fixtures from leaking into the next test.
    prisma.ctfStage.deleteMany(),
    prisma.checkInRecord.deleteMany(),
    prisma.qrToken.deleteMany(),
    prisma.participant.deleteMany(),
    prisma.team.deleteMany(),
    prisma.session.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.eventPhaseState.deleteMany(),
    prisma.user.deleteMany(),
    prisma.systemSetting.deleteMany(),
  ]);
}

export async function initIntegrationDatabase(): Promise<PrismaClient> {
  // Imported lazily so a placeholder-DATABASE_URL run never constructs a client.
  if (!prisma) {
    const { PrismaClient } = (await import('@prisma/client')) as {
      PrismaClient: new (options?: unknown) => PrismaClient;
    };
    prisma = new PrismaClient({ log: ['error'] });
    await prisma.$connect();
  }
  return prisma;
}

export async function destroyIntegrationDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
