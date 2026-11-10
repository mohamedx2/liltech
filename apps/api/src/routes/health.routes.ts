import { Router } from 'express';
import { checkDatabaseHealth } from '../config/database';
import type { HealthResponse } from 'api-contracts';
import { ApiError } from '../utils/api-error';
/**
 * GET /api/health — application health, including database availability.
 *
 * The API being up and the database being reachable are reported separately:
 * - `200` with `status: "ok"`      — application and database are healthy
 * - `503` with `status: "degraded"` — application is running but the database is unreachable
 */
export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    const database = await checkDatabaseHealth();

    const body: HealthResponse = {
      status: database.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database,
    };

    res.status(database.status === 'up' ? 200 : 503).json(body);
  } catch (error) {
    next(new ApiError('INTERNAL', 'Health check failed.', 500, { cause: error }));
  }
});
