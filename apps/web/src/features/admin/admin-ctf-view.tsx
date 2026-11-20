'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AdminCtfOverviewResponse, AdminCtfStage, AdminCtfTeam } from 'api-contracts';
import { api } from '@/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { DataTable } from '@/components/ui/table';
import { errorMessage, formatTime, TeamStatusBadge } from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Mini-CTF board for event night: the server-owned clock, the configuration of
 * every LOUAGE 404 stage and each team's progress through the chain.
 *
 * Read-only on purpose. Answers are changed through provisioning, the event is
 * launched from the Control Panel, and a team's early access is granted from
 * its team page. The server never sends answers or digests to this page.
 */

const REFRESH_INTERVAL_MS = 15_000;

type ClockState = 'not-launched' | 'open' | 'closed';

interface AttentionItem {
  key: string;
  tone: 'warning' | 'danger';
  message: string;
  action?: { href: string; label: string };
}

function clockState(board: AdminCtfOverviewResponse): ClockState {
  if (board.timing.open) return 'open';
  if (board.timing.startedAt) return 'closed';
  return 'not-launched';
}

const CLOCK_BADGE: Record<ClockState, { tone: BadgeTone; label: string }> = {
  'not-launched': { tone: 'neutral', label: 'Not launched' },
  open: { tone: 'success', label: 'Open' },
  closed: { tone: 'danger', label: 'Closed' },
};

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Minutes between the launch and the team's final flag, e.g. "12 min". */
function solveDuration(startedAt: string | null, solvedAt: string | null): string | null {
  if (!startedAt || !solvedAt) return null;
  const minutes = (Date.parse(solvedAt) - Date.parse(startedAt)) / 60_000;
  return `${Math.max(0, Math.round(minutes))} min`;
}

function attentionItems(board: AdminCtfOverviewResponse): AttentionItem[] {
  const items: AttentionItem[] = [];
  const blocking = board.stages.filter(
    (stage) => stage.requiredForUnlock && (stage.status !== 'live' || !stage.answerConfigured),
  );

  if (blocking.length > 0) {
    const first = blocking[0];
    items.push({
      key: 'blocking',
      tone: 'danger',
      message:
        `${blocking.length} required stage(s) are draft or have no answer ` +
        `(${blocking.map((stage) => stage.position).join(', ')}). The chain is sequential: ` +
        `every team stops at stage ${first.position} and nobody can finish the Mini-CTF. ` +
        'Add the answers and re-run the Provision Mini-CTF workflow.',
    });
  }

  if (board.phase === 'registration' || board.phase === 'checkin') {
    items.push({
      key: 'not-live',
      tone: 'warning',
      message:
        'The event is not live yet. The Mini-CTF opens for checked-in teams when you start the event.',
      action: { href: '/admin', label: 'Open the Control Panel' },
    });
  } else if (board.totals.checkedInTeams === 0) {
    items.push({
      key: 'no-teams',
      tone: 'warning',
      message: 'No team is checked in: nobody can play the Mini-CTF.',
      action: { href: '/checkin', label: 'Open QR Check-In' },
    });
  }

  return items;
}

function StageStatusBadge({ stage }: { stage: AdminCtfStage }) {
  const tone: BadgeTone =
    stage.status === 'live' ? 'success' : stage.status === 'closed' ? 'neutral' : 'warning';
  return <Badge tone={tone}>{stage.status}</Badge>;
}

function TeamPositionCell({ team, totalStages }: { team: AdminCtfTeam; totalStages: number }) {
  if (team.chainSolvedAt) {
    return <Badge tone="success">Finished</Badge>;
  }
  if (team.currentStagePosition !== null) {
    return (
      <span className={styles.strong}>
        Stage {team.currentStagePosition}/{totalStages}
      </span>
    );
  }
  return <span className={styles.small}>{team.checkedIn ? 'Not started' : 'Cannot play'}</span>;
}

export function AdminCtfView() {
  const [board, setBoard] = useState<AdminCtfOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  // Server clock minus local clock, so the countdown follows server time.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const loadData = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const next = await api.admin.getCtfOverview();
      setBoard(next);
      setClockOffsetMs(Date.parse(next.timing.serverTime) - Date.now());
      setLoadError(null);
      setRefreshedAt(new Date());
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load the Mini-CTF board.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const initialLoad = useRef(loadData);
  useEffect(() => {
    void initialLoad.current();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadData({ quiet: true });
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const isOpen = board?.timing.open ?? false;
  useEffect(() => {
    if (!isOpen) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [isOpen]);

  if (isLoading && board === null) {
    return <LoadingState message="Loading the Mini-CTF board..." />;
  }

  if (board === null) {
    return (
      <ErrorState
        title="Mini-CTF Board Unavailable"
        message={loadError ?? 'Failed to load the Mini-CTF board.'}
        onRetry={() => void loadData()}
      />
    );
  }

  const state = clockState(board);
  const badge = CLOCK_BADGE[state];
  const remainingMs =
    state === 'open' && board.timing.closesAt
      ? Date.parse(board.timing.closesAt) - (now + clockOffsetMs)
      : null;
  const attention = attentionItems(board);
  const totalStages = board.stages.length;

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="ctf-admin-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Mini-CTF · LOUAGE 404</span>
          <div className={styles.badgeRow}>
            <Badge tone={badge.tone} showDot>
              {badge.label}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadData({ quiet: true })}
              aria-label="Refresh the Mini-CTF board"
            >
              <Icon name="refresh" /> Refresh
            </Button>
          </div>
        </div>
        <h1 id="ctf-admin-title" className={styles.title}>
          Mini-CTF
        </h1>
        <p className={styles.description}>
          The {board.windowMinutes}-minute chain, its stages and every team&apos;s progress.
          Read-only: answers change through provisioning, the event starts from the Control Panel,
          and early access is granted on a team&apos;s page. Refreshes every 15 seconds
          {refreshedAt ? ` — last update ${refreshedAt.toLocaleTimeString()}` : ''}.
        </p>
      </section>

      {loadError ? (
        <p className={styles.attentionItem} data-tone="danger" role="alert">
          Refresh failed: {loadError} Showing the last loaded data.
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="ctf-attention-heading">
        <h2 id="ctf-attention-heading" className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Icon name="alert-triangle" />
          </span>
          Needs attention
        </h2>
        {attention.length > 0 ? (
          <ul className={styles.attentionList}>
            {attention.map((item) => (
              <li key={item.key} className={styles.attentionItem} data-tone={item.tone}>
                <span>{item.message}</span>
                {item.action ? (
                  <Link className={styles.link} href={item.action.href}>
                    {item.action.label}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.attentionItem} data-tone="ok">
            Every required stage is live with an answer.
          </p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="ctf-clock-heading">
        <h2 id="ctf-clock-heading" className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Icon name="zap" />
          </span>
          Clock and teams
        </h2>
        <dl className={styles.statGrid}>
          <div className={styles.stat}>
            <dt>Time left</dt>
            <dd aria-live="off">
              {remainingMs !== null
                ? formatCountdown(remainingMs)
                : state === 'closed'
                  ? '00:00'
                  : '—'}
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>Launched</dt>
            <dd className={styles.small}>{formatTime(board.timing.startedAt)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Closes</dt>
            <dd className={styles.small}>{formatTime(board.timing.closesAt)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Teams playing</dt>
            <dd>
              {board.totals.startedTeams}
              <span className={styles.statDetail}> / {board.totals.checkedInTeams} checked in</span>
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>Chain finished</dt>
            <dd>{board.totals.completedTeams}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Live stages</dt>
            <dd>
              {board.totals.liveStages}
              <span className={styles.statDetail}> / {board.totals.stages}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel} aria-labelledby="ctf-stages-heading">
        <h2 id="ctf-stages-heading" className={styles.sectionTitle}>
          Stages ({totalStages})
        </h2>
        {totalStages > 0 ? (
          <DataTable
            caption="LOUAGE 404 stages in chain order"
            rows={board.stages}
            getRowKey={(stage) => stage.slug}
            columns={[
              {
                key: 'stage',
                header: 'Stage',
                render: (stage) => (
                  <div className={styles.cellStack}>
                    <span className={styles.strong}>
                      {stage.position}. {stage.title}
                    </span>
                    <span className={styles.small}>{stage.slug}</span>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (stage) => <StageStatusBadge stage={stage} />,
              },
              {
                key: 'answer',
                header: 'Answer',
                render: (stage) =>
                  stage.answerConfigured ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="danger">Missing</Badge>
                  ),
              },
              {
                key: 'drive',
                header: 'Drive files',
                render: (stage) => (stage.hasDriveUrl ? 'Yes' : '—'),
              },
              { key: 'hints', header: 'Hints', render: (stage) => stage.hintCount },
              { key: 'solved', header: 'Solved by', render: (stage) => stage.solvedTeams },
              { key: 'attempts', header: 'Attempts', render: (stage) => stage.attempts },
            ]}
          />
        ) : (
          <EmptyState
            title="No stage provisioned"
            message="Run the Provision Mini-CTF workflow to create the LOUAGE 404 stages."
          />
        )}
      </section>

      <section className={styles.panel} aria-labelledby="ctf-teams-heading">
        <h2 id="ctf-teams-heading" className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Icon name="users" />
          </span>
          Teams ({board.teams.length})
        </h2>
        {board.teams.length > 0 ? (
          <DataTable
            caption="Teams by Mini-CTF progress, finished teams first"
            rows={board.teams}
            getRowKey={(team) => team.teamId}
            columns={[
              {
                key: 'team',
                header: 'Team',
                render: (team) => (
                  <div className={styles.cellStack}>
                    <Link className={styles.link} href={`/admin/teams/${team.teamId}`}>
                      {team.teamName}
                    </Link>
                    {team.standing !== 'active' ? <TeamStatusBadge status={team.standing} /> : null}
                  </div>
                ),
              },
              {
                key: 'checkin',
                header: 'Check-in',
                render: (team) =>
                  team.checkedIn ? (
                    <Badge tone="info">Checked in</Badge>
                  ) : (
                    <Badge tone="neutral">Not checked in</Badge>
                  ),
              },
              {
                key: 'position',
                header: 'Position',
                render: (team) => <TeamPositionCell team={team} totalStages={totalStages} />,
              },
              {
                key: 'solved',
                header: 'Solved',
                render: (team) => `${team.solvedStages}/${totalStages}`,
              },
              { key: 'attempts', header: 'Attempts', render: (team) => team.attempts },
              { key: 'hints', header: 'Hints', render: (team) => team.hintsUsed },
              {
                key: 'result',
                header: 'Result',
                render: (team) => {
                  const duration = solveDuration(board.timing.startedAt, team.chainSolvedAt);
                  return duration ? (
                    <div className={styles.cellStack}>
                      <span className={styles.strong}>{team.points ?? 0} pts</span>
                      <span className={styles.small}>in {duration}</span>
                    </div>
                  ) : (
                    '—'
                  );
                },
              },
              {
                key: 'activity',
                header: 'Last activity',
                render: (team) => formatTime(team.lastActivityAt),
              },
            ]}
          />
        ) : (
          <EmptyState title="No team registered" message="Teams appear here once they register." />
        )}
      </section>
    </div>
  );
}
