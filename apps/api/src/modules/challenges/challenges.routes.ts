import { Router, type NextFunction, type Request, type Response } from 'express';
import type { CurrentChallengeResponse } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { hasUnlockedMainChallenge } from '../ctf/ctf.service';

/**
 * Main challenge endpoints.
 *
 * Only the gate exists so far: `GET /api/challenges/current` refuses access
 * with `403 CTF_NOT_SOLVED` until the team solves the live Mini-CTF stage.
 * The main challenge brief itself is not published yet, so an unlocked team
 * gets an explicit "not published" payload rather than invented content.
 */

export const challengesRouter: Router = Router();

challengesRouter.get(
  '/challenges/current',
  requireAuth,
  requireRole('team'),
  (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
      next(ApiError.unauthorized());
      return;
    }

    hasUnlockedMainChallenge(userId)
      .then((unlocked) => {
        if (!unlocked) {
          next(ApiError.ctfNotSolved());
          return;
        }

        const body: CurrentChallengeResponse = {
          unlocked: true,
          challenge: null,
          message: 'The main challenge brief has not been published yet.',
        };

        res.status(200).json(body);
      })
      .catch(next);
  },
);
