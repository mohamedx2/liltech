import type { TeamPortalSummary } from 'api-contracts';
import { getPrismaClient } from '../../config/database';

/**
 * Team portal reads. The team is always resolved from the authenticated
 * account (`Team.leaderId`), never from a client-supplied identifier.
 */
export async function getTeamPortalSummary(
  leaderUserId: string,
): Promise<TeamPortalSummary | null> {
  const prisma = getPrismaClient();

  const team = await prisma.team.findUnique({
    where: { leaderId: leaderUserId },
    include: {
      participants: {
        orderBy: [{ isLeader: 'desc' }, { name: 'asc' }],
        include: { checkIn: { select: { id: true } } },
      },
    },
  });

  if (!team) {
    return null;
  }

  const members = team.participants.map((participant) => ({
    id: participant.id,
    teamId: team.id,
    fullName: participant.name,
    email: participant.email,
    roleInTeam: participant.isLeader ? ('leader' as const) : ('member' as const),
    color: participant.color,
    isCheckedIn: Boolean(participant.checkIn),
  }));

  return {
    id: team.id,
    name: team.name,
    progress: team.progressState,
    isCheckedIn: members.some((member) => member.isCheckedIn),
    members,
  };
}
