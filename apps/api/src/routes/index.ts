import { Router } from 'express';
import { healthRouter } from './health.routes';

/**
 * Mounts all feature routes under `/api`.
 * Future modules (auth, registration, check-in, mini-ctf, challenges,
 * submissions, announcements, jury, scoring, admin, results) plug in here —
 * see `docs/architecture/` for the planned module boundaries.
 */
export const apiRouter: Router = Router();

apiRouter.use(healthRouter);
