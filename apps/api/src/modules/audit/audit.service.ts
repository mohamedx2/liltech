import type { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';

/**
 * Audit trail for sensitive actions (phase transitions, badge revocation, …).
 *
 * Callers that need the audit entry to be atomic with the audited action pass
 * their transaction client (which is the case for every current caller); on
 * failure the whole action rolls back, so the trail cannot silently diverge
 * from reality.
 */

export const AuditAction = {
  EventPhaseChanged: 'event.phase_changed',
  CheckInScan: 'checkin.scan',
  BadgeRevoked: 'checkin.badge_revoked',
  AnnouncementPublished: 'announcement.published',
  TeamCreated: 'registration.team_created',
  BadgeEmailResent: 'badge.email_resent',
  JuryCreated: 'jury.created',
  JuryUpdated: 'jury.updated',
  JuryDeleted: 'jury.deleted',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLogEntryInput {
  action: AuditAction;
  actorId?: string;
  targetType?: string;
  targetId?: string;
}

export async function recordAuditLog(
  entry: AuditLogEntryInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const prisma = tx ?? getPrismaClient();

  await prisma.auditLog.create({
    data: {
      action: entry.action,
      actorId: entry.actorId,
      targetType: entry.targetType,
      targetId: entry.targetId,
    },
  });
}
