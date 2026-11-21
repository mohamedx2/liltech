import { Router } from 'express';
import {
  juryTeamQuerySchema,
  submitEvaluationRequestSchema,
  type JuryOverviewResponse,
  type JuryTeamEvaluationResponse,
  type JuryTeamItem,
  type SubmitEvaluationResponse,
} from 'api-contracts';
import { requireAuth, requireRole } from '../../middleware/auth';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import {
  getJuryOverview,
  getJuryTeamEvaluation,
  listJuryTeams,
  submitJuryEvaluation,
} from './jury.service';

/**
 * Jury evaluation endpoints (jury role only). The juror is resolved from the
 * session, never from the request, and is limited to their assigned challenge.
 * See `jury-contracts` for the shapes.
 */
export const juryRouter: Router = Router();

const juryOnly = [requireAuth, requireRole('jury')] as const;

juryRouter.get('/jury/overview', ...juryOnly, async (req, res) => {
  const body: JuryOverviewResponse = await getJuryOverview(authenticatedUserId(req));
  res.status(200).json(body);
});

juryRouter.get('/jury/teams', ...juryOnly, async (req, res) => {
  const body: JuryTeamItem[] = await listJuryTeams(authenticatedUserId(req));
  res.status(200).json(body);
});

juryRouter.get('/jury/evaluation', ...juryOnly, async (req, res) => {
  const { teamId } = parseOrThrow(juryTeamQuerySchema, req.query);
  const body: JuryTeamEvaluationResponse = await getJuryTeamEvaluation(
    authenticatedUserId(req),
    teamId,
  );
  res.status(200).json(body);
});

juryRouter.post('/jury/evaluation', ...juryOnly, async (req, res) => {
  const { teamId } = parseOrThrow(juryTeamQuerySchema, req.query);
  const input = parseOrThrow(submitEvaluationRequestSchema, req.body);
  const body: SubmitEvaluationResponse = await submitJuryEvaluation(
    authenticatedUserId(req),
    teamId,
    input,
  );
  res.status(200).json(body);
});
