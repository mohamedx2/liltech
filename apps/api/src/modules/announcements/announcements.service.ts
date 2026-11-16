import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import type { Announcement, CreateAnnouncementRequest } from 'api-contracts';

/**
 * Live announcement feed. Publication is admin-only and audited; reads are
 * open to any authenticated role until a visibility decision says otherwise.
 */

export async function publishAnnouncement(
  request: CreateAnnouncementRequest,
  adminUserId: string,
): Promise<Announcement> {
  const prisma = getPrismaClient();
  const author = await prisma.user.findUniqueOrThrow({
    where: { id: adminUserId },
    select: { name: true },
  });

  const announcement = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { body: request.body, authorId: adminUserId },
    });

    await recordAuditLog(
      {
        action: AuditAction.AnnouncementPublished,
        actorId: adminUserId,
        targetType: 'announcement',
        targetId: created.id,
      },
      tx,
    );

    return created;
  });

  return {
    id: announcement.id,
    body: announcement.body,
    publishedAt: announcement.publishedAt.toISOString(),
    authorName: author.name,
  };
}

export async function listAnnouncements(
  limit: number,
  offset: number,
): Promise<{ items: Announcement[]; total: number }> {
  const prisma = getPrismaClient();

  const [total, announcements] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.findMany({
      orderBy: { publishedAt: 'desc' },
      skip: offset,
      take: limit,
      include: { author: { select: { name: true } } },
    }),
  ]);

  return {
    items: announcements.map((announcement) => ({
      id: announcement.id,
      body: announcement.body,
      publishedAt: announcement.publishedAt.toISOString(),
      authorName: announcement.author.name,
    })),
    total,
  };
}

/** Removes a wrong or outdated announcement from every feed (admin only, audited). */
export async function deleteAnnouncement(
  announcementId: string,
  adminUserId: string,
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const removed = await tx.announcement.deleteMany({ where: { id: announcementId } });
    if (removed.count === 0) {
      throw ApiError.notFound('Announcement not found.');
    }
    await recordAuditLog(
      {
        action: AuditAction.AnnouncementDeleted,
        actorId: adminUserId,
        targetType: 'announcement',
        targetId: announcementId,
      },
      tx,
    );
  });
}
