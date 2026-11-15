import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ctfSubmitRequestSchema } from 'api-contracts';
import { ApiError, formatZodIssues } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getChain, getStage, revealNextHint, submitAnswer } from './ctf.service';

/**
 * LOUAGE 404 endpoints (team role only):
 * - `GET  /api/ctf/chain`                — stage tracker + current stage
 * - `GET  /api/ctf/stages/:slug`         — one stage (403 when locked)
 * - `POST /api/ctf/stages/:slug/hints`   — reveal the next hint
 * - `POST /api/ctf/stages/:slug/submit`  — validate a flag, unlock the next stage
 *
 * Sequential eligibility, correctness and rate limiting are decided in the
 * service. This router validates input and shapes responses.
 */

export const ctfRouter: Router = Router();

const teamOnly = [requireAuth, requireRole('team')] as const;

const stageSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{2,59}$/);

function requireUserId(req: Request, next: NextFunction): string | undefined {
  const id = req.user?.id;

  if (!id) {
    next(ApiError.unauthorized());
    return undefined;
  }

  return id;
}

function parseSlug(req: Request, next: NextFunction): string | undefined {
  const parsed = stageSlugSchema.safeParse(req.params.slug);

  if (!parsed.success) {
    next(ApiError.badRequest('Unknown Mini-CTF stage.'));
    return undefined;
  }

  return parsed.data;
}

ctfRouter.get('/ctf/chain', ...teamOnly, (req: Request, res: Response, next: NextFunction) => {
  const userId = requireUserId(req, next);

  if (!userId) {
    return;
  }

  getChain(userId)
    .then((chain) => {
      res.status(200).json(chain);
    })
    .catch(next);
});

ctfRouter.get('/ctf/stages/:slug', ...teamOnly, (req, res, next) => {
  const userId = requireUserId(req, next);
  const slug = parseSlug(req, next);

  if (!userId || !slug) {
    return;
  }

  getStage(userId, slug)
    .then((stage) => {
      res.status(200).json(stage);
    })
    .catch(next);
});

ctfRouter.post('/ctf/stages/:slug/hints', ...teamOnly, (req, res, next) => {
  const userId = requireUserId(req, next);
  const slug = parseSlug(req, next);

  if (!userId || !slug) {
    return;
  }

  revealNextHint(userId, slug)
    .then((hint) => {
      res.status(200).json(hint);
    })
    .catch(next);
});

ctfRouter.post('/ctf/stages/:slug/submit', ...teamOnly, (req, res, next) => {
  const input = ctfSubmitRequestSchema.safeParse(req.body);

  if (!input.success) {
    next(ApiError.badRequest('The request payload is invalid.', formatZodIssues(input.error)));
    return;
  }

  const userId = requireUserId(req, next);
  const slug = parseSlug(req, next);

  if (!userId || !slug) {
    return;
  }

  submitAnswer(userId, slug, input.data.answer)
    .then((result) => {
      res.status(200).json(result);
    })
    .catch(next);
});
