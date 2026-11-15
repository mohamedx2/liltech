import { Router, type NextFunction, type Request, type Response } from 'express';
import { auditLogListRequestSchema, type AuditLogEntry } from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createJuryAccountRequestSchema,
  juryIdParamsSchema,
  participantIdParamsSchema,
  resetTeamPasswordRequestSchema,
  teamIdParamsSchema,
  updateJuryAccountRequestSchema,
  type AdminJuryListResponse,
} from 'api-contracts';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import { resendBadgeEmail } from '../badges/badges.service';
import { listTeams, resetTeamPassword } from './admin.service';
import {
  createJuryAccount,
  deleteJuryAccount,
  listJuryAccountDetails,
  updateJuryAccount,
} from './jury-accounts.service';

/**
 * Admin operational endpoints.
 * - `GET /api/admin/audit-log` — audited administrative actions, newest first.
 * - `GET /api/admin/teams`     — full team roster with check-in state.
 * - `GET /api/admin/jury`      — jury accounts, including their passwords.
 * - `POST /api/admin/jury`, `PATCH|DELETE /api/admin/jury/:id` — jury management (audited).
 * - `POST /api/admin/participants/:participantId/resend-badge-email` — no hourly limit (audited).
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

    listAuditLog(input.data.limit, input.data.offset)
      .then((result) => {
        res.status(200).json(result);
      })
      .catch(next);
  },
);

adminRouter.get('/admin/teams', requireAuth, requireRole('admin'), (_req, res, next) => {
  listTeams()
    .then((result) => {
      res.status(200).json(result);
    })
    .catch(next);
});

const adminOnly = [requireAuth, requireRole('admin')] as const;

adminRouter.post('/admin/teams/:teamId/reset-password', ...adminOnly, async (req, res) => {
  const { teamId } = parseOrThrow(teamIdParamsSchema, req.params);
  const input = parseOrThrow(resetTeamPasswordRequestSchema, req.body ?? {});
  res.status(200).json(await resetTeamPassword(teamId, input, authenticatedUserId(req)));
});

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
): Promise<{ items: AuditLogEntry[]; total: number }> {
  const prisma = getPrismaClient();

  const [total, entries] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
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
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
  }));

  return { items, total };
}
