import { Router, type NextFunction, type Request, type Response } from 'express';
import { announcementIdParamsSchema, createAnnouncementRequestSchema } from 'api-contracts';
import { ApiError } from '../../utils/api-error';
import { requireAuth, requireRole } from '../../middleware/auth';
import { authenticatedUserId, parseOrThrow } from '../../utils/validation';
import {
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
} from './announcements.service';

/**
 * Announcement endpoints.
 * - `POST /api/announcements` — admin only (audited)
 * - `GET  /api/announcements` — any authenticated role
 * - `DELETE /api/announcements/:announcementId` — admin only (audited)
 */

export const announcementsRouter: Router = Router();

announcementsRouter.post(
  '/announcements',
  requireAuth,
  requireRole('admin'),
  (req: Request, res: Response, next: NextFunction) => {
    const input = createAnnouncementRequestSchema.safeParse(req.body);

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

    const adminUserId = req.user?.id;

    if (!adminUserId) {
      next(ApiError.unauthorized());
      return;
    }

    publishAnnouncement(input.data, adminUserId)
      .then((announcement) => {
        res.status(201).json(announcement);
      })
      .catch(next);
  },
);

announcementsRouter.get(
  '/announcements',
  requireAuth,
  (_req: Request, res: Response, next: NextFunction) => {
    listAnnouncements(50, 0)
      .then((result) => {
        res.status(200).json(result);
      })
      .catch(next);
  },
);

announcementsRouter.delete(
  '/announcements/:announcementId',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const { announcementId } = parseOrThrow(announcementIdParamsSchema, req.params);
    await deleteAnnouncement(announcementId, authenticatedUserId(req));
    res.status(204).send();
  },
);
