import { Router } from 'express';
import {
  participantIdParamsSchema,
  type ResendBadgeEmailResponse,
  type TeamBadgesResponse,
  type TeamPortalSummary,
} from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import { requireAuth, requireRole } from '../../middleware/auth';
import { listTeamBadges, resendBadgeEmail } from '../badges/badges.service';
import { getTeamPortalSummary } from './participants.service';

/**
 * Team portal endpoints (team role). The team is always the authenticated
 * account's own team; participant ids from other teams answer 404.
 * - `GET  /api/participants/team`                              — team + members
 * - `GET  /api/participants/badge`                             — every member's QR badge
 * - `POST /api/participants/badge/:participantId/resend-email` — at most once per hour
 */

export const participantsRouter: Router = Router();

const teamOnly = [requireAuth, requireRole('team')] as const;

participantsRouter.get('/participants/team', ...teamOnly, async (req, res) => {
  const summary = await getTeamPortalSummary(authenticatedUserId(req));

  if (!summary) {
    throw ApiError.notFound('No registered team found for this account.');
  }

  const body: TeamPortalSummary = summary;
  res.status(200).json(body);
});

participantsRouter.get('/participants/badge', ...teamOnly, async (req, res) => {
  const badges = await listTeamBadges(authenticatedUserId(req));

  if (!badges) {
    throw ApiError.notFound('No registered team found for this account.');
  }

  const body: TeamBadgesResponse = badges;
  res.status(200).json(body);
});

participantsRouter.post(
  '/participants/badge/:participantId/resend-email',
  ...teamOnly,
  async (req, res) => {
    const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
    const body: ResendBadgeEmailResponse = await resendBadgeEmail(participantId, {
      kind: 'team',
      leaderUserId: authenticatedUserId(req),
    });
    res.status(200).json(body);
  },
);
