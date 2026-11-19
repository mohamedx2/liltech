import { Router } from 'express';
import {
  createSubmissionRequestSchema,
  type SubmissionItem,
  type SubmissionsOverviewResponse,
} from 'api-contracts';
import { requireAuth, requireRole } from '../../middleware/auth';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import { createSubmission, listSubmissionsForTeam } from './submissions.service';

/**
 * Team submission endpoints (team role only):
 * - `GET  /api/submissions` — both challenges with access, deadlines and history
 * - `POST /api/submissions` — record a link submission (append-only)
 *
 * A team only ever sees its own submissions: the team is resolved from the
 * authenticated account, never from the request.
 */

export const submissionsRouter: Router = Router();

const teamOnly = [requireAuth, requireRole('team')] as const;

submissionsRouter.get('/submissions', ...teamOnly, async (req, res) => {
  const body: SubmissionsOverviewResponse = await listSubmissionsForTeam(authenticatedUserId(req));
  res.status(200).json(body);
});

submissionsRouter.post('/submissions', ...teamOnly, async (req, res) => {
  const input = parseOrThrow(createSubmissionRequestSchema, req.body);
  const body: SubmissionItem = await createSubmission(authenticatedUserId(req), input);
  res.status(201).json(body);
});
