import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOrigins } from './config/env';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { apiRouter } from './routes';

/**
 * Builds the Express application (no side effects, no listening).
 * Server startup lives in `server.ts` so the app can be imported by tests.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger(logger));

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
