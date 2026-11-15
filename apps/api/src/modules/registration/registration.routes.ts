import { Router, type NextFunction, type Request, type Response } from 'express';
import { createTeamRequestSchema, type TeamResponse } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { createRateLimiter } from '../../utils/rate-limiter';
import { env } from '../../config/env';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getMyTeam, registerTeamWithBadges } from './registration.service';

/**
 * Registration endpoints.
 * - `POST /api/registration/teams` — public team leader registration
 *   (account is always created with the `team` role server-side; role can
 *   never be chosen by the client).
 * - `GET  /api/registration/teams/me` — the authenticated team's own team.
 */

export const registrationRouter: Router = Router();

/**
 * Per client IP: registration is public and sends emails, so it must not be
 * usable to spam. Generous enough for several teams behind one campus NAT.
 */
const registrationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.REGISTRATION_RATE_LIMIT_PER_HOUR,
});

registrationRouter.post(
  '/registration/teams',
  (req: Request, res: Response, next: NextFunction) => {
    if (!registrationRateLimiter.check(`registration|${req.ip ?? 'unknown'}`).ok) {
      next(ApiError.rateLimited('Too many registrations from this network. Try again later.'));
      return;
    }

    const input = createTeamRequestSchema.safeParse(req.body);

    if (!input.success) {
      next(
        ApiError.badRequest(
          'The request payload is invalid.',
          input.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    registerTeamWithBadges(input.data)
      .then((registered) => {
        res.status(201).json(registered);
      })
      .catch(next);
  },
);

registrationRouter.get(
  '/registration/teams/me',
  requireAuth,
  requireRole('team'),
  (req: Request, res: Response, next: NextFunction) => {
    const leaderUserId = req.user?.id;

    if (!leaderUserId) {
      next(ApiError.unauthorized());
      return;
    }

    getMyTeam(leaderUserId)
      .then((team) => {
        if (!team) {
          next(ApiError.notFound('No registered team found for this account.'));
          return;
        }
        const body: TeamResponse = team;
        res.status(200).json(body);
      })
      .catch(next);
  },
);
