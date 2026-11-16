import { Router } from 'express';
import {
  challengeIdParamsSchema,
  createChallengeRequestSchema,
  updateChallengeRequestSchema,
  type AdminChallengeListResponse,
  type ChallengeAdminDetail,
  type CurrentChallengeResponse,
  type TeamChallengeListResponse,
} from 'api-contracts';
import { requireAuth, requireRole } from '../../middleware/auth';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import {
  createChallenge,
  endChallenge,
  getCurrentChallengeForTeam,
  listChallengesForAdmin,
  listChallengesForTeam,
  startChallenge,
  updateChallenge,
} from './challenges.service';

/**
 * Challenge endpoints.
 * Team role (always the caller's own team; content is gated server-side):
 * - `GET /api/challenges`, `GET /api/challenges/current`
 * Admin role (audited; start/end only while the event is `live`):
 * - `GET|POST /api/admin/challenges`, `PATCH /api/admin/challenges/:id`
 * - `POST /api/admin/challenges/:id/start`, `POST /api/admin/challenges/:id/end`
 */

export const challengesRouter: Router = Router();

const teamOnly = [requireAuth, requireRole('team')] as const;
const adminOnly = [requireAuth, requireRole('admin')] as const;

challengesRouter.get('/challenges', ...teamOnly, async (req, res) => {
  const body: TeamChallengeListResponse = await listChallengesForTeam(authenticatedUserId(req));
  res.status(200).json(body);
});

challengesRouter.get('/challenges/current', ...teamOnly, async (req, res) => {
  const body: CurrentChallengeResponse = await getCurrentChallengeForTeam(authenticatedUserId(req));
  res.status(200).json(body);
});

challengesRouter.get('/admin/challenges', ...adminOnly, async (_req, res) => {
  const body: AdminChallengeListResponse = await listChallengesForAdmin();
  res.status(200).json(body);
});

challengesRouter.post('/admin/challenges', ...adminOnly, async (req, res) => {
  const input = parseOrThrow(createChallengeRequestSchema, req.body);
  const body: ChallengeAdminDetail = await createChallenge(input, authenticatedUserId(req));
  res.status(201).json(body);
});

challengesRouter.patch('/admin/challenges/:id', ...adminOnly, async (req, res) => {
  const { id } = parseOrThrow(challengeIdParamsSchema, req.params);
  const input = parseOrThrow(updateChallengeRequestSchema, req.body);
  const body: ChallengeAdminDetail = await updateChallenge(id, input, authenticatedUserId(req));
  res.status(200).json(body);
});

challengesRouter.post('/admin/challenges/:id/start', ...adminOnly, async (req, res) => {
  const { id } = parseOrThrow(challengeIdParamsSchema, req.params);
  const body: ChallengeAdminDetail = await startChallenge(id, authenticatedUserId(req));
  res.status(200).json(body);
});

challengesRouter.post('/admin/challenges/:id/end', ...adminOnly, async (req, res) => {
  const { id } = parseOrThrow(challengeIdParamsSchema, req.params);
  const body: ChallengeAdminDetail = await endChallenge(id, authenticatedUserId(req));
  res.status(200).json(body);
});
