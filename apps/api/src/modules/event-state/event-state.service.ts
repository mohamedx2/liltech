import { getPrismaClient } from '../../config/database';
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
}

const SINGLE_ROW_ID = 1;

export async function getEventState(): Promise<EventState> {
  const prisma = getPrismaClient();

  // The row is upserted lazily so a fresh database starts in `registration`.
  const state = await prisma.eventPhaseState.upsert({
    where: { id: SINGLE_ROW_ID },
    update: {},
    create: { id: SINGLE_ROW_ID },
  });

  return { phase: state.phase, phaseChangedAt: state.phaseChangedAt };
}

export async function setEventPhase(
  newPhase: EventPhase,
  adminUserId: string,
): Promise<EventState> {
  const prisma = getPrismaClient();

  const currentState = await getEventState();

  if (currentState.phase === newPhase) {
    throw ApiError.badRequest(`The event is already in the "${newPhase}" phase.`);
  }

  return prisma.$transaction(async (tx) => {
    const state = await tx.eventPhaseState.update({
      where: { id: SINGLE_ROW_ID },
      data: { phase: newPhase, phaseChangedAt: new Date(), changedByUserId: adminUserId },
    });

    await tx.auditLog.create({
      data: {
        action: 'event.phase_changed',
        actorId: adminUserId,
        targetType: 'event_phase_state',
        targetId: String(SINGLE_ROW_ID),
      },
    });

    return { phase: state.phase, phaseChangedAt: state.phaseChangedAt };
  });
}
