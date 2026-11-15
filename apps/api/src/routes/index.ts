import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { eventStateRouter } from '../modules/event-state/event-state.routes';
import { registrationRouter } from '../modules/registration/registration.routes';
import { checkinRouter } from '../modules/checkin/checkin.routes';
import { announcementsRouter } from '../modules/announcements/announcements.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { ctfRouter } from '../modules/ctf/ctf.routes';
import { challengesRouter } from '../modules/challenges/challenges.routes';

/**
 * Mounts all feature routes under `/api`.
 * See `docs/architecture/overview.md` for module boundaries and
 * `docs/api/README.md` for the documented endpoints.
 */
export const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(eventStateRouter);
apiRouter.use(registrationRouter);
apiRouter.use(checkinRouter);
apiRouter.use(announcementsRouter);
apiRouter.use(adminRouter);
apiRouter.use(ctfRouter);
apiRouter.use(challengesRouter);
