import { PrismaClient } from '@prisma/client';
import { isDevelopment, isTest } from './env';

/**
 * Prisma is the only database access layer in this backend.
 * Feature code must import the client from this module — never create
 * additional `PrismaClient` instances.
 */

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: isDevelopment ? ['query', 'warn', 'error'] : isTest ? ['error'] : ['warn', 'error'],
    });
  }
  return prisma;
}

export async function connectDatabase(): Promise<void> {
  await getPrismaClient().$connect();
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export type DatabaseHealth = {
  status: 'up' | 'down';
  /** Round-trip time of the health query in milliseconds, when the database is up. */
  latencyMs?: number;
};

/**
 * Distinguishes application health from database availability.
 * Runs a trivial query with a hard timeout so health checks stay fast.
 */
export async function checkDatabaseHealth(timeoutMs = 2000): Promise<DatabaseHealth> {
  const start = Date.now();

  try {
    const client = getPrismaClient();
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs),
      ),
    ]);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down' };
  }
}
