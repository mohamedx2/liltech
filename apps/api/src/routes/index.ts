import { Router } from 'express';
import { apiDocsEnabled } from '../config/env';
import { healthRouter } from './health.routes';
import { docsRouter } from '../modules/docs/docs.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { eventStateRouter } from '../modules/event-state/event-state.routes';
import { registrationRouter } from '../modules/registration/registration.routes';
import { checkinRouter } from '../modules/checkin/checkin.routes';
import { announcementsRouter } from '../modules/announcements/announcements.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { participantsRouter } from '../modules/participants/participants.routes';
import { ctfRouter } from '../modules/ctf/ctf.routes';
import { challengesRouter } from '../modules/challenges/challenges.routes';
import { submissionsRouter } from '../modules/submissions/submissions.routes';
import { juryRouter } from '../modules/jury/jury.routes';

/**
 * Mounts all feature routes under `/api`.
 * See `docs/architecture/overview.md` for module boundaries and
 * `docs/api/README.md` for the documented endpoints.
 */
export const apiRouter: Router = Router();

apiRouter.use(healthRouter);
if (apiDocsEnabled) {
  apiRouter.use(docsRouter);
}
apiRouter.use(authRouter);
apiRouter.use(eventStateRouter);
apiRouter.use(registrationRouter);
apiRouter.use(checkinRouter);
apiRouter.use(announcementsRouter);
apiRouter.use(adminRouter);
apiRouter.use(participantsRouter);
apiRouter.use(ctfRouter);
apiRouter.use(challengesRouter);
apiRouter.use(submissionsRouter);
apiRouter.use(juryRouter);
