import {
  BADGE_COLORS,
  TeamProgressState,
  type AdminOverviewResponse,
  type TeamProgressState as TeamProgress,
} from 'api-contracts';
import { getPrismaClient } from '../../config/database';
import { getEventState } from '../event-state/event-state.service';

/**
 * Admin situation board: one read that answers "what needs attention right
 * now?" — check-in coverage, badge email problems, challenge timing, team
 * standing. Aggregates only; no personal data.
 */
export async function getAdminOverview(): Promise<AdminOverviewResponse> {
  const prisma = getPrismaClient();

  const [
    state,
    teams,
    participants,
    badges,
    challenges,
    juryAccounts,
    announcementCount,
    lastAnnouncement,
  ] = await Promise.all([
    getEventState(),
    prisma.team.findMany({
      select: {
        status: true,
        progressState: true,
        participants: { select: { checkIn: { select: { id: true } } } },
      },
    }),
    prisma.participant.findMany({
      select: { color: true, email: true, checkIn: { select: { id: true } } },
    }),
    prisma.qrToken.findMany({ select: { revokedAt: true, emailStatus: true } }),
    prisma.challenge.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { ctfSolves: true } } },
    }),
    prisma.user.count({ where: { role: 'jury' } }),
    prisma.announcement.count(),
    prisma.announcement.findFirst({
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    }),
  ]);

  const byProgress = Object.fromEntries(
    Object.values(TeamProgressState).map((progress) => [progress, 0]),
  ) as Record<TeamProgress, number>;
  let fullyCheckedIn = 0;
  let partiallyCheckedIn = 0;
  let notCheckedIn = 0;

  const activeTeams = teams.filter((team) => team.status === 'active');
  for (const team of activeTeams) {
    byProgress[team.progressState] += 1;
    const checked = team.participants.filter((participant) => participant.checkIn).length;
    if (checked === 0) {
      notCheckedIn += 1;
    } else if (checked === team.participants.length) {
      fullyCheckedIn += 1;
    } else {
      partiallyCheckedIn += 1;
    }
  }

  return {
    serverTime: new Date().toISOString(),
    phase: state.phase,
    phaseChangedAt: state.phaseChangedAt.toISOString(),
    teams: {
      total: teams.length,
      active: activeTeams.length,
      withdrawn: teams.filter((team) => team.status === 'withdrawn').length,
      disqualified: teams.filter((team) => team.status === 'disqualified').length,
      byProgress,
      fullyCheckedIn,
      partiallyCheckedIn,
      notCheckedIn,
    },
    participants: {
      total: participants.length,
      checkedIn: participants.filter((participant) => participant.checkIn).length,
      byColor: BADGE_COLORS.map((color) => {
        const group = participants.filter((participant) => participant.color === color);
        return {
          color,
          total: group.length,
          checkedIn: group.filter((participant) => participant.checkIn).length,
        };
      }),
    },
    badges: {
      revoked: badges.filter((badge) => badge.revokedAt).length,
      emailSent: badges.filter((badge) => badge.emailStatus === 'sent').length,
      emailPending: badges.filter((badge) => badge.emailStatus === 'pending').length,
      emailFailed: badges.filter((badge) => badge.emailStatus === 'failed').length,
      missingEmail: participants.filter((participant) => !participant.email).length,
    },
    challenges: challenges.map((challenge) => ({
      id: challenge.id,
      position: challenge.position,
      title: challenge.title,
      status: challenge.status,
      startedAt: challenge.startedAt?.toISOString() ?? null,
      publicAt: challenge.publicAt?.toISOString() ?? null,
      endedAt: challenge.endedAt?.toISOString() ?? null,
      ctfSolvedTeams: challenge._count.ctfSolves,
    })),
    juryAccounts,
    announcements: {
      total: announcementCount,
      lastPublishedAt: lastAnnouncement?.publishedAt.toISOString() ?? null,
    },
  };
}
