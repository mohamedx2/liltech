import { Router, type NextFunction, type Request, type Response } from 'express';
import { ctfSubmitRequestSchema } from 'api-contracts';
import { ApiError, formatZodIssues } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getStageForTeam, revealNextHint, submitAnswer } from './ctf.service';

/**
 * Mini-CTF gate endpoints (team role only):
 * - `GET  /api/ctf/stage`        — current stage + this team's progress
 * - `POST /api/ctf/stage/hints`  — reveal the next hint
 * - `POST /api/ctf/stage/submit` — validate an answer and unlock the main challenge
 *
 * Every decision (open/closed, correct/incorrect, rate limit) belongs to the
 * service; this router only validates input and shapes responses.
 */

export const ctfRouter: Router = Router();

const teamOnly = [requireAuth, requireRole('team')] as const;

function requireUserId(req: Request, next: NextFunction): string | undefined {
  const id = req.user?.id;

  if (!id) {
    next(ApiError.unauthorized());
    return undefined;
  }

  return id;
}

ctfRouter.get('/ctf/stage', ...teamOnly, (req: Request, res: Response, next: NextFunction) => {
  const userId = requireUserId(req, next);

  if (!userId) {
    return;
  }

  getStageForTeam(userId)
    .then((response) => {
      res.status(200).json(response);
    })
    .catch(next);
});

ctfRouter.post(
  '/ctf/stage/hints',
  ...teamOnly,
  (req: Request, res: Response, next: NextFunction) => {
    const userId = requireUserId(req, next);

    if (!userId) {
      return;
    }

    revealNextHint(userId)
      .then((response) => {
        res.status(200).json(response);
      })
      .catch(next);
  },
);

ctfRouter.post(
  '/ctf/stage/submit',
  ...teamOnly,
  (req: Request, res: Response, next: NextFunction) => {
    const input = ctfSubmitRequestSchema.safeParse(req.body);

    if (!input.success) {
      next(ApiError.badRequest('The request payload is invalid.', formatZodIssues(input.error)));
      return;
    }

    const userId = requireUserId(req, next);

    if (!userId) {
      return;
    }

    submitAnswer(userId, input.data.answer)
      .then((response) => {
        res.status(200).json(response);
      })
      .catch(next);
  },
);
