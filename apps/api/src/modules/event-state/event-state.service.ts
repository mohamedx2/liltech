import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../config/database';
import { AuditAction, recordAuditLog } from '../audit/audit.service';
import { ApiError } from '../../utils/api-error';
import type { EventPhase } from 'api-contracts';

/**
 * Event phase state — the backend is the single writer and single source of
 * truth for the current phase. Phase changes are administrative, audited, and
 * transactional (audit entry and state change commit or roll back together).
 */

export interface EventState {
  phase: EventPhase;
  phaseChangedAt: Date;
  /** Set once, when the event first enters `live` (the Mini-CTF launch). */
  ctfStartedAt: Date | null;
}

const SINGLE_ROW_ID = 1;

export async function getEventState(): Promise<EventState> {
  const prisma = getPrismaClient();

  // The row is upserted lazily so a fresh database starts in `registration`.
  const state = await prisma.eventPhaseState.upsert({
    where: { id: SINGLE_ROW_ID },
    update: {},
    create: { id: SINGLE_ROW_ID, ctfStartedAt: null },
  });

  return {
    phase: state.phase,
    phaseChangedAt: state.phaseChangedAt,
    ctfStartedAt: state.ctfStartedAt,
  };
}

/** The canonical phase order; normal transitions move exactly one step forward. */
export const PHASE_ORDER: readonly EventPhase[] = [
  'registration',
  'checkin',
  'live',
  'submissions_closed',
  'pitching',
  'results',
];

/** True when `to` is the phase directly after `from`. */
export function isNextPhase(from: EventPhase, to: EventPhase): boolean {
  return PHASE_ORDER.indexOf(to) === PHASE_ORDER.indexOf(from) + 1;
}

/**
 * Moves the event to `newPhase`. Only the next phase is accepted unless
 * `force` is set (skipping ahead or going back is an administrative
 * override). Repeating the current phase is an idempotent no-op, except that
 * entering `live` always records the Mini-CTF launch instant when it is still
 * missing. The current phase is read inside the transaction, and the audit
 * entry records `from -> to`.
 */
export async function setEventPhase(
  newPhase: EventPhase,
  adminUserId: string,
  options: { force?: boolean } = {},
): Promise<EventState> {
  const prisma = getPrismaClient();

  // Make sure the single state row exists before locking it in the transaction.
  await getEventState();

  return prisma.$transaction(
    async (tx) => {
      const current = await tx.eventPhaseState.findUniqueOrThrow({ where: { id: SINGLE_ROW_ID } });
      const now = new Date();

      // Idempotent repeat. It still repairs the Mini-CTF launch instant when a
      // database was placed in `live` before that column existed.
      if (current.phase === newPhase) {
        if (newPhase !== 'live' || current.ctfStartedAt) {
          return {
            phase: current.phase,
            phaseChangedAt: current.phaseChangedAt,
            ctfStartedAt: current.ctfStartedAt,
          };
        }

        const repaired = await tx.eventPhaseState.update({
          where: { id: SINGLE_ROW_ID },
          data: { ctfStartedAt: now },
        });
        await recordAuditLog(
          {
            action: AuditAction.CtfLaunched,
            actorId: adminUserId,
            targetType: 'event_phase_state',
            targetId: String(SINGLE_ROW_ID),
            summary: 'Mini-CTF launch recorded on the live phase',
          },
          tx,
        );
        return {
          phase: repaired.phase,
          phaseChangedAt: repaired.phaseChangedAt,
          ctfStartedAt: repaired.ctfStartedAt,
        };
      }

      const isOverride = !isNextPhase(current.phase, newPhase);
      if (isOverride && !options.force) {
        throw ApiError.conflict(
          `The event can only move from "${current.phase}" to the next phase. Send "force": true to override.`,
        );
      }

      // The first entry into `live` starts the Mini-CTF clock. It is never
      // cleared afterwards, so an override back to `live` cannot restart it.
      const launchesCtf = newPhase === 'live' && current.ctfStartedAt === null;

      const state = await tx.eventPhaseState.update({
        where: { id: SINGLE_ROW_ID },
        data: {
          phase: newPhase,
          phaseChangedAt: now,
          changedByUserId: adminUserId,
          ...(launchesCtf ? { ctfStartedAt: now } : {}),
        },
      });

      await recordAuditLog(
        {
          action: AuditAction.EventPhaseChanged,
          actorId: adminUserId,
          targetType: 'event_phase_state',
          targetId: String(SINGLE_ROW_ID),
          summary: `${current.phase} -> ${newPhase}${isOverride ? ' (override)' : ''}`,
        },
        tx,
      );

      return {
        phase: state.phase,
        phaseChangedAt: state.phaseChangedAt,
        ctfStartedAt: state.ctfStartedAt,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
