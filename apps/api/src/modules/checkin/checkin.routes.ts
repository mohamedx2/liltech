import { Router, type NextFunction, type Request, type Response } from 'express';
import { scanCheckInRequestSchema, type CheckInResponse } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { listBadges, revokeBadge, scanCheckIn } from './checkin.service';

/**
 * Check-in endpoints (staff operate with the `admin` role; the specification
 * defines no separate staff account type).
 * - `POST /api/checkin/scan`   — verify a badge token and record the check-in
 * - `POST /api/checkin/revoke` — revoke a badge (credential semantics)
 * - `GET  /api/checkin/badges` — badge roster (no token material)
 */

export const checkinRouter: Router = Router();

const adminOnly = [requireAuth, requireRole('admin')] as const;

/** Returns the verified admin id, or hands a 401 to the error chain. */
function requireAdminUserId(req: Request, next: NextFunction): string | undefined {
  const id = req.user?.id;

  if (!id) {
    next(ApiError.unauthorized());
    return undefined;
  }

  return id;
}

checkinRouter.post(
  '/checkin/scan',
  ...adminOnly,
  (req: Request, res: Response, next: NextFunction) => {
    const input = scanCheckInRequestSchema.safeParse(req.body);

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

    const adminUserId = requireAdminUserId(req, next);

    if (!adminUserId) {
      return;
    }

    scanCheckIn(input.data.token, adminUserId)
      .then((response) => {
        const body: CheckInResponse = response;
        res.status(200).json(body);
      })
      .catch(next);
  },
);

checkinRouter.post('/checkin/revoke', ...adminOnly, (req, res, next) => {
  const participantId = (req.body as { participantId?: unknown }).participantId;

  if (typeof participantId !== 'string' || !participantId) {
    next(ApiError.badRequest('A participantId is required.'));
    return;
  }

  const adminUserId = requireAdminUserId(req, next);
  if (!adminUserId) {
    return;
  }

  revokeBadge(participantId, adminUserId)
    .then((result) => {
      res.status(200).json({ participantId, ...result });
    })
    .catch(next);
});

checkinRouter.get('/checkin/badges', ...adminOnly, (_req, res, next) => {
  listBadges()
    .then((badges) => {
      res.status(200).json({ items: badges, total: badges.length });
    })
    .catch(next);
});
