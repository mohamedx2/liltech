import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  AdminJuryAccountDetail,
  CreateJuryAccountRequest,
  UpdateJuryAccountRequest,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { ApiError } from '../../utils/api-error';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { hashPassword } from '../auth/password.service';

/**
 * Jury account management (admin only). Jury passwords are stored hashed for
 * login and, by organizer decision, also readable so administrators can hand
 * them out (AGENTS.md §9). Every query is pinned to `role: 'jury'`, so these
 * endpoints can never read or modify a team or admin account.
 */

const JURY_ROLE = 'jury' as const;

/** 16 characters of base64url (96 bits): strong, and easy to read out loud. */
function generateJuryPassword(): string {
  return randomBytes(12).toString('base64url');
}

function toDetail(user: {
  id: string;
  name: string;
  email: string;
  juryPlainPassword: string | null;
  createdAt: Date;
}): AdminJuryAccountDetail {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.juryPlainPassword,
    createdAt: user.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const emailTaken = () =>
  ApiError.conflict('An account with this email already exists.', [
    { path: 'email', message: 'This email is already used by another account.' },
  ]);

export async function listJuryAccountDetails(): Promise<AdminJuryAccountDetail[]> {
  const prisma = getPrismaClient();

  const users = await prisma.user.findMany({
    where: { role: JURY_ROLE },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, juryPlainPassword: true, createdAt: true },
  });

  return users.map(toDetail);
}

export async function createJuryAccount(
  request: CreateJuryAccountRequest,
  adminUserId: string,
): Promise<AdminJuryAccountDetail> {
  const prisma = getPrismaClient();
  const email = request.email.toLowerCase();
  const password = request.password ?? generateJuryPassword();
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw emailTaken();
      }

      const user = await tx.user.create({
        data: {
          role: JURY_ROLE,
          name: request.name,
          email,
          passwordHash,
          juryPlainPassword: password,
        },
      });

      await recordAuditLog(
        {
          action: AuditAction.JuryCreated,
          actorId: adminUserId,
          targetType: 'user',
          targetId: user.id,
        },
        tx,
      );

      return toDetail(user);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw emailTaken();
    }
    throw error;
  }
}

export async function updateJuryAccount(
  juryUserId: string,
  request: UpdateJuryAccountRequest,
  adminUserId: string,
): Promise<AdminJuryAccountDetail> {
  const prisma = getPrismaClient();
  const email = request.email?.toLowerCase();
  const passwordHash = request.password ? await hashPassword(request.password) : undefined;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: juryUserId, role: JURY_ROLE },
        select: { id: true, email: true },
      });

      if (!existing) {
        throw ApiError.notFound('Jury account not found.');
      }

      if (email && email !== existing.email) {
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
          throw emailTaken();
        }
      }

      const user = await tx.user.update({
        where: { id: juryUserId },
        data: {
          ...(request.name !== undefined ? { name: request.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(request.password !== undefined
            ? { passwordHash, juryPlainPassword: request.password }
            : {}),
        },
      });

      // A new password ends every existing jury session.
      if (request.password !== undefined) {
        await tx.session.updateMany({
          where: { userId: juryUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordAuditLog(
        {
          action: AuditAction.JuryUpdated,
          actorId: adminUserId,
          targetType: 'user',
          targetId: juryUserId,
        },
        tx,
      );

      return toDetail(user);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw emailTaken();
    }
    throw error;
  }
}

export async function deleteJuryAccount(juryUserId: string, adminUserId: string): Promise<void> {
  const prisma = getPrismaClient();

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: juryUserId, role: JURY_ROLE },
        select: { id: true },
      });

      if (!existing) {
        throw ApiError.notFound('Jury account not found.');
      }

      await recordAuditLog(
        {
          action: AuditAction.JuryDeleted,
          actorId: adminUserId,
          targetType: 'user',
          targetId: juryUserId,
        },
        tx,
      );

      // Sessions cascade with the account, which ends every login at once.
      await tx.user.delete({ where: { id: juryUserId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw ApiError.conflict(
        'This jury account still has records attached and cannot be deleted.',
      );
    }
    throw error;
  }
}
