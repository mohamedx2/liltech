import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  addParticipantRequestSchema,
  auditLogListRequestSchema,
  grantCtfSolveRequestSchema,
  renameTeamRequestSchema,
  sendBadgeEmailsRequestSchema,
  setParticipantPaymentRequestSchema,
  setTeamStatusRequestSchema,
  teamCtfSolveParamsSchema,
  teamIdParamsSchema,
  updateParticipantRequestSchema,
  type AdminCtfOverviewResponse,
  type AdminTeamListResponse,
  type AuditLogEntry,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createJuryAccountRequestSchema,
  juryIdParamsSchema,
  participantIdParamsSchema,
  updateJuryAccountRequestSchema,
  type AdminJuryListResponse,
} from 'api-contracts';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import {
  reissueBadge,
  resendBadgeEmail,
  resendFailedBadgeEmails,
  sendBulkBadgeEmailsWithTemplate,
} from '../badges/badges.service';
import { getAdminOverview } from './admin.service';
import { getAdminCtfOverview } from './ctf-overview.service';
import {
  addParticipant,
  deleteTeam,
  getAdminTeam,
  grantCtfSolve,
  listAdminTeams,
  manualCheckIn,
  removeParticipant,
  renameTeam,
  resetTeamPassword,
  revokeCtfSolve,
  setParticipantPayment,
  setTeamStatus,
  undoCheckIn,
  updateParticipant,
} from './team-operations.service';
import {
  createJuryAccount,
  deleteJuryAccount,
  listJuryAccountDetails,
  updateJuryAccount,
} from './jury-accounts.service';

/**
 * Admin operational endpoints.
 * - `GET /api/admin/overview`  — live situation board (aggregates).
 * - `GET /api/admin/ctf`       — Mini-CTF board: clock, stage configuration and
 *   per-team progress (never answers or digests).
 * - `GET /api/admin/audit-log` — audited administrative actions, newest first,
 *   optionally filtered by action prefix.
 * - `GET /api/admin/teams[/:teamId]` — roster with contact, badge, check-in and
 *   Mini-CTF state; team and participant tools below (all audited, see
 *   `admin-operations-contracts`).
 * - `GET /api/admin/jury`      — jury accounts, including their passwords.
 * - `POST /api/admin/jury`, `PATCH|DELETE /api/admin/jury/:id` — jury management (audited).
 * - `POST /api/admin/participants/:participantId/resend-badge-email` — no hourly limit (audited).
 * - `PUT /api/admin/participants/:participantId/payment` — mark the fee paid/unpaid (audited).
 *
 * Every route here is admin-only.
 */

export const adminRouter: Router = Router();

adminRouter.get(
  '/admin/audit-log',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response, next: NextFunction) => {
    const input = auditLogListRequestSchema.safeParse(req.query);

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

    listAuditLog(input.data.limit, input.data.offset, input.data.action)
      .then((result) => {
        res.status(200).json(result);
      })
      .catch(next);
  },
);

const adminOnly = [requireAuth, requireRole('admin')] as const;

adminRouter.get('/admin/overview', ...adminOnly, async (_req, res) => {
  res.status(200).json(await getAdminOverview());
});

adminRouter.get('/admin/ctf', ...adminOnly, async (_req, res) => {
  const body: AdminCtfOverviewResponse = await getAdminCtfOverview();
  res.status(200).json(body);
});

// ── Teams ────────────────────────────────────────────────────────────────────

adminRouter.get('/admin/teams', ...adminOnly, async (_req, res) => {
  const body: AdminTeamListResponse = await listAdminTeams();
  res.status(200).json(body);
});

adminRouter.get('/admin/teams/:teamId', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  res.status(200).json(await getAdminTeam(teamId));
});

adminRouter.patch('/admin/teams/:teamId', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  const input = parseOrThrow(renameTeamRequestSchema, req.body);
  res.status(200).json(await renameTeam(teamId, input, authenticatedUserId(req)));
});

adminRouter.post('/admin/teams/:teamId/status', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  const input = parseOrThrow(setTeamStatusRequestSchema, req.body);
  res.status(200).json(await setTeamStatus(teamId, input, authenticatedUserId(req)));
});

adminRouter.post('/admin/teams/:teamId/reset-password', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  res.status(200).json(await resetTeamPassword(teamId, authenticatedUserId(req)));
});

adminRouter.delete('/admin/teams/:teamId', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  await deleteTeam(teamId, authenticatedUserId(req));
  res.status(204).send();
});

adminRouter.post('/admin/teams/:teamId/participants', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  const input = parseOrThrow(addParticipantRequestSchema, req.body);
  res.status(201).json(await addParticipant(teamId, input, authenticatedUserId(req)));
});

adminRouter.post('/admin/teams/:teamId/ctf-solves', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  const { challengeId } = parseOrThrow(grantCtfSolveRequestSchema, req.body);
  res.status(201).json(await grantCtfSolve(teamId, challengeId, authenticatedUserId(req)));
});

adminRouter.delete(
  '/admin/teams/:teamId/ctf-solves/:challengeId',
  ...adminOnly,
  async (req, res) => {
    const { teamId, challengeId } = parseOrThrow(teamCtfSolveParamsSchema, req.params);
    res.status(200).json(await revokeCtfSolve(teamId, challengeId, authenticatedUserId(req)));
  },
);

// ── Participants ─────────────────────────────────────────────────────────────

adminRouter.patch('/admin/participants/:participantId', ...adminOnly, async (req, res) => {
  const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
  const input = parseOrThrow(updateParticipantRequestSchema, req.body);
  res.status(200).json(await updateParticipant(participantId, input, authenticatedUserId(req)));
});

adminRouter.delete('/admin/participants/:participantId', ...adminOnly, async (req, res) => {
  const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
  res.status(200).json(await removeParticipant(participantId, authenticatedUserId(req)));
});

adminRouter.put('/admin/participants/:participantId/payment', ...adminOnly, async (req, res) => {
  const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
  const { paid } = parseOrThrow(setParticipantPaymentRequestSchema, req.body);
  res.status(200).json(await setParticipantPayment(participantId, paid, authenticatedUserId(req)));
});

adminRouter.post('/admin/participants/:participantId/check-in', ...adminOnly, async (req, res) => {
  const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
  res.status(200).json(await manualCheckIn(participantId, authenticatedUserId(req)));
});

adminRouter.delete(
  '/admin/participants/:participantId/check-in',
  ...adminOnly,
  async (req, res) => {
    const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
    res.status(200).json(await undoCheckIn(participantId, authenticatedUserId(req)));
  },
);

adminRouter.post(
  '/admin/participants/:participantId/reissue-badge',
  ...adminOnly,
  async (req, res) => {
    const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
    res.status(200).json(await reissueBadge(participantId, authenticatedUserId(req)));
  },
);

adminRouter.post('/admin/badges/resend-failed', ...adminOnly, async (req, res) => {
  res.status(200).json(await resendFailedBadgeEmails(authenticatedUserId(req)));
});

adminRouter.post('/admin/badges/send-all', ...adminOnly, async (req, res) => {
  const input = parseOrThrow(sendBadgeEmailsRequestSchema, req.body);
  res.status(200).json(await sendBulkBadgeEmailsWithTemplate(authenticatedUserId(req), input));
});

// ── Jury ─────────────────────────────────────────────────────────────────────

adminRouter.get('/admin/jury', ...adminOnly, async (_req, res) => {
  const items = await listJuryAccountDetails();
  const body: AdminJuryListResponse = { items, total: items.length };
  res.status(200).json(body);
});

adminRouter.post('/admin/jury', ...adminOnly, async (req, res) => {
  const input = parseOrThrow(createJuryAccountRequestSchema, req.body);
  res.status(201).json(await createJuryAccount(input, authenticatedUserId(req)));
});

adminRouter.patch('/admin/jury/:id', ...adminOnly, async (req, res) => {
  const { id } = parseOrThrow(juryIdParamsSchema, req.params);
  const input = parseOrThrow(updateJuryAccountRequestSchema, req.body);
  res.status(200).json(await updateJuryAccount(id, input, authenticatedUserId(req)));
});

adminRouter.delete('/admin/jury/:id', ...adminOnly, async (req, res) => {
  const { id } = parseOrThrow(juryIdParamsSchema, req.params);
  await deleteJuryAccount(id, authenticatedUserId(req));
  res.status(204).send();
});

adminRouter.post(
  '/admin/participants/:participantId/resend-badge-email',
  ...adminOnly,
  async (req, res) => {
    const { participantId } = parseOrThrow(participantIdParamsSchema, req.params);
    res.status(200).json(
      await resendBadgeEmail(participantId, {
        kind: 'admin',
        adminUserId: authenticatedUserId(req),
      }),
    );
  },
);

async function listAuditLog(
  limit: number,
  offset: number,
  actionPrefix?: string,
): Promise<{ items: AuditLogEntry[]; total: number }> {
  const prisma = getPrismaClient();
  const where = actionPrefix ? { action: { startsWith: actionPrefix } } : {};

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const items: AuditLogEntry[] = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorName: entry.actor?.name ?? null,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
  }));

  return { items, total };
}
