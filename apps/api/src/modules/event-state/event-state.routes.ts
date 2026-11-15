import { Router } from 'express';
import { updateEventStateRequestSchema, type EventStateResponse } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { getEventState, setEventPhase } from './event-state.service';

/**
 * Event state endpoints.
 * - `GET /api/event-state`  — public read: phase + authoritative server time
 * - `POST /api/event-state` — admin phase transition (audited)
 */

export const eventStateRouter: Router = Router();

function eventStateBody(
  phase: EventStateResponse['phase'],
  phaseChangedAt: Date,
): EventStateResponse {
  return {
    phase,
    phaseChangedAt: phaseChangedAt.toISOString(),
    serverTime: new Date().toISOString(),
  };
}

eventStateRouter.get('/event-state', async (_req, res, next) => {
  try {
    const state = await getEventState();
    res.status(200).json(eventStateBody(state.phase, state.phaseChangedAt));
  } catch (error) {
    next(error);
  }
});

eventStateRouter.post('/event-state', requireAuth, requireRole('admin'), async (req, res, next) => {
  const adminUserId = req.user?.id;

  if (!adminUserId) {
    next(ApiError.unauthorized());
    return;
  }

  const input = updateEventStateRequestSchema.safeParse(req.body);

  if (!input.success) {
    next(
      ApiError.badRequest(
        'The request payload is invalid.',
        input.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      ),
    );
    return;
  }

  try {
    const state = await setEventPhase(input.data.phase, adminUserId, {
      force: input.data.force,
    });
    res.status(200).json(eventStateBody(state.phase, state.phaseChangedAt));
  } catch (error) {
    next(error);
  }
});
