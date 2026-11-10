import { Router, type NextFunction, type Request, type Response } from 'express';
import { auditLogListRequestSchema, type AuditLogEntry } from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';

/**
 * Admin operational endpoints.
 * - `GET /api/admin/audit-log` — audited administrative actions, newest first.
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
    createdAt: entry.createdAt.toISOString(),
  }));

  return { items, total };
}
