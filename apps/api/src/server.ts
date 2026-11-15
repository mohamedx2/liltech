import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';
import { waitForScheduledBadgeEmails } from './modules/badges/badges.service';
import { runBadgeMaintenance } from './modules/badges/badge-maintenance.service';

/**
 * Server startup — separated from `app.ts` so the Express app itself can be
 * tested without binding ports or opening database connections.
 *
 * `dotenv/config` loads the workspace-root `.env` when present (Nx runs tasks
 * from the workspace root); real environments provide variables directly.
 */

// Fail fast on invalid configuration before touching the network.
if (!env) {
  logger.fatal('invalid environment configuration');
  process.exit(1);
}

async function bootstrap(): Promise<void> {
  await connectDatabase();

  // Make every badge readable and re-send emails cut off by a restart.
  await runBadgeMaintenance();

  const app = createApp();

  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      { host: env.API_HOST, port: env.API_PORT, env: env.NODE_ENV },
      `API listening on http://${env.API_HOST}:${env.API_PORT}`,
    );
    // Set when Nx waits for this server to be ready (`serve` target).
    emitReadySignal(server);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'graceful shutdown started');
    server.close(async () => {
      // Let queued badge emails finish (bounded by the forced-exit timer below).
      await waitForScheduledBadgeEmails();
      await disconnectDatabase();
      logger.info('graceful shutdown complete');
      process.exit(0);
    });
    // Do not hang forever if connections refuse to drain.
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

function emitReadySignal(server: unknown): void {
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      void load('@nx/js/ready-signal').then((m) => m.emitReadySignal(server));
    } catch {
      // @nx/js isn't installed
    }
  }
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'failed to start API');
  process.exit(1);
});
