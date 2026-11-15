import { getPrismaClient } from '../../config/database';
import type { AdminTeamListResponse, TeamResponse } from 'api-contracts';

/**
 * Admin operational listings (read-only). Backed by existing models only —
 * challenge track and results administration stay unimplemented until the
 * decisions in `docs/decisions/OPEN_QUESTIONS.md` (questions 1, 3–5) land.
 */

/** Full team roster, newest first, leaders ordered first within each team. */
export async function listTeams(): Promise<AdminTeamListResponse> {
  const prisma = getPrismaClient();

  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      participants: {
        orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
        include: { checkIn: { select: { checkedInAt: true } } },
      },
    },
  });

  const items: TeamResponse[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    progressState: team.progressState,
    createdAt: team.createdAt.toISOString(),
    leader: {
      id: team.leaderId,
      name: team.participants.find((participant) => participant.isLeader)?.name ?? '',
    },
    participants: team.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isLeader: participant.isLeader,
      ...(participant.checkIn
        ? { checkedInAt: participant.checkIn.checkedInAt.toISOString() }
        : {}),
    })),
  }));

  return { items, total: items.length };
}
