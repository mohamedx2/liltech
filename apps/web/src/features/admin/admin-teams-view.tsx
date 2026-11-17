'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminTeam } from 'api-contracts';
import { api } from '@/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FormField, Select, TextInput } from '@/components/ui/input';
import { DataTable } from '@/components/ui/table';
import {
  checkInCount,
  ColorDot,
  ConfirmActionDialog,
  errorMessage,
  FeedbackBanner,
  ProgressBadge,
  TeamStatusBadge,
  type Feedback,
} from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Team roster for administrators: find any team or participant fast (name,
 * email, team), filter by the situations that need action, export the
 * roster, and open a team to fix it. Operational view — no decoration.
 */

export const ROSTER_FILTERS = {
  all: 'All teams',
  'not-checked-in': 'No member checked in',
  partial: 'Partially checked in',
  complete: 'Fully checked in',
  'email-problem': 'Badge email problem',
  'revoked-badge': 'Has a revoked badge',
  'needs-members': 'Below minimum size (4)',
  inactive: 'Withdrawn or disqualified',
} as const;

export type RosterFilter = keyof typeof ROSTER_FILTERS;

const TEAM_MEMBERS_MIN = 4;

function isRosterFilter(value: string | null): value is RosterFilter {
  return value !== null && value in ROSTER_FILTERS;
}

export function matchesFilter(team: AdminTeam, filter: RosterFilter): boolean {
  const { checked, total } = checkInCount(team);
  const active = team.status === 'active';
  switch (filter) {
    case 'all':
      return true;
    case 'not-checked-in':
      return active && checked === 0;
    case 'partial':
      return active && checked > 0 && checked < total;
    case 'complete':
      return active && checked === total;
    case 'email-problem':
      return team.participants.some(
        (participant) => !participant.email || participant.badge?.emailStatus === 'failed',
      );
    case 'revoked-badge':
      return team.participants.some((participant) => participant.badge?.revokedAt);
    case 'needs-members':
      return active && total < TEAM_MEMBERS_MIN;
    case 'inactive':
      return !active;
  }
}

export function matchesSearch(team: AdminTeam, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    team.name.toLowerCase().includes(needle) ||
    team.leader.email.toLowerCase().includes(needle) ||
    team.participants.some(
      (participant) =>
        participant.name.toLowerCase().includes(needle) ||
        (participant.email ?? '').toLowerCase().includes(needle) ||
        (participant.university ?? '').toLowerCase().includes(needle) ||
        (participant.phone ?? '').includes(needle),
    )
  );
}

function csvCell(value: string): string {
  // Neutralize spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rosterToCsv(teams: readonly AdminTeam[]): string {
  const header = [
    'Team',
    'Team status',
    'Progress',
    'Participant',
    'Role',
    'Email',
    'University',
    'Mobile number',
    'Badge color',
    'Checked in at',
    'Badge email',
    'Badge revoked',
  ];
  const rows = teams.flatMap((team) =>
    team.participants.map((participant) => [
      team.name,
      team.status,
      team.progressState,
      participant.name,
      participant.isLeader ? 'leader' : 'member',
      participant.email ?? '',
      participant.university ?? '',
      participant.phone ?? '',
      participant.color ?? '',
      participant.checkedInAt ?? '',
      participant.badge?.emailStatus ?? '',
      participant.badge?.revokedAt ? 'yes' : 'no',
    ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Lets spreadsheet apps detect UTF-8 (names with accents). */
const UTF8_BOM = String.fromCharCode(0xfeff);

function downloadCsv(teams: readonly AdminTeam[]) {
  const blob = new Blob([`${UTF8_BOM}${rosterToCsv(teams)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `liltech-roster-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminTeamsView() {
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmRetryEmails, setConfirmRetryEmails] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const roster = await api.admin.getTeams();
      setTeams(roster.items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load the team roster.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deep links from the situation board: `/admin/teams?filter=partial`.
    const fromUrl = new URLSearchParams(window.location.search).get('filter');
    if (isRosterFilter(fromUrl)) setFilter(fromUrl);
    void loadData();
  }, [loadData]);

  const visibleTeams = useMemo(
    () => (teams ?? []).filter((team) => matchesFilter(team, filter) && matchesSearch(team, query)),
    [teams, filter, query],
  );

  if (isLoading && teams === null) {
    return <LoadingState message="Loading the team roster..." />;
  }

  if (loadError && teams === null) {
    return <ErrorState title="Team Roster Unavailable" message={loadError} onRetry={loadData} />;
  }

  const allTeams = teams ?? [];
  const totalParticipants = allTeams.reduce((sum, team) => sum + team.participants.length, 0);
  const totalCheckedIn = allTeams.reduce((sum, team) => sum + checkInCount(team).checked, 0);
  const failedEmails = allTeams.reduce(
    (sum, team) => sum + team.participants.filter((p) => p.badge?.emailStatus === 'failed').length,
    0,
  );

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="teams-title">
        <span className={styles.eyebrow}>Registration & Check-in</span>
        <h1 id="teams-title" className={styles.title}>
          Teams
        </h1>
        <p className={styles.description}>
          Find any team or participant by name or email, filter the teams that need action, and open
          a team to fix members, badges, check-in, Mini-CTF access, or its standing.
        </p>
        <dl className={styles.statGrid}>
          <div className={styles.stat}>
            <dt>Teams</dt>
            <dd>{allTeams.length}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Participants</dt>
            <dd>{totalParticipants}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Checked in</dt>
            <dd>{totalCheckedIn}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Failed emails</dt>
            <dd>{failedEmails}</dd>
          </div>
        </dl>
      </section>

      <FeedbackBanner feedback={feedback} />

      <section aria-labelledby="teams-table-heading" className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarGrow}>
            <FormField label="Search teams, participants or emails">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Sara, team name, @gmail.com"
                />
              )}
            </FormField>
          </div>
          <FormField label="Show">
            {({ id }) => (
              <Select
                id={id}
                value={filter}
                onChange={(event) =>
                  isRosterFilter(event.target.value) && setFilter(event.target.value)
                }
              >
                {Object.entries(ROSTER_FILTERS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <div className={styles.actions}>
            <Button variant="outline" size="md" onClick={() => void loadData()}>
              <Icon name="refresh" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => downloadCsv(visibleTeams)}
              disabled={visibleTeams.length === 0}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setConfirmRetryEmails(true)}
              disabled={failedEmails === 0}
            >
              Retry failed emails
            </Button>
          </div>
        </div>

        <h2 id="teams-table-heading" className={styles.sectionTitle} aria-live="polite">
          {visibleTeams.length} of {allTeams.length} teams
        </h2>

        {visibleTeams.length === 0 ? (
          <EmptyState
            title={allTeams.length === 0 ? 'No teams registered yet' : 'No team matches'}
            message={
              allTeams.length === 0
                ? 'Teams appear here as soon as leaders complete registration.'
                : 'Change the search or the filter.'
            }
          />
        ) : (
          <DataTable
            caption="Registered teams with standing, progress and check-in state"
            rows={visibleTeams}
            getRowKey={(team) => team.id}
            columns={[
              {
                key: 'name',
                header: 'Team',
                render: (team) => (
                  <div className={styles.cellStack}>
                    <Link className={styles.link} href={`/admin/teams/${team.id}`}>
                      {team.name}
                    </Link>
                    <span className={styles.small}>
                      {team.leader.name} · {team.leader.email}
                    </span>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Standing',
                render: (team) => (
                  <div className={styles.badgeRow}>
                    <TeamStatusBadge status={team.status} />
                    <ProgressBadge progress={team.progressState} />
                  </div>
                ),
              },
              {
                key: 'checkin',
                header: 'Checked in',
                render: (team) => {
                  const { checked, total } = checkInCount(team);
                  return (
                    <Badge
                      tone={checked === total ? 'success' : checked > 0 ? 'warning' : 'neutral'}
                    >
                      {checked} / {total}
                    </Badge>
                  );
                },
              },
              {
                key: 'members',
                header: 'Members',
                render: (team) => (
                  <ul className={styles.list}>
                    {team.participants.map((participant) => (
                      <li key={participant.id} className={styles.small}>
                        <ColorDot color={participant.color} />
                        {participant.name}
                        {participant.isLeader ? ' (leader)' : ''}
                        {participant.checkedInAt ? ' ✓' : ''}
                        {participant.badge?.emailStatus === 'failed' ? ' · email failed' : ''}
                        {!participant.email ? ' · no email' : ''}
                        {participant.badge?.revokedAt ? ' · badge revoked' : ''}
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'open',
                header: 'Actions',
                render: (team) => (
                  <Link className={styles.link} href={`/admin/teams/${team.id}`}>
                    Manage
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>

      <ConfirmActionDialog
        open={confirmRetryEmails}
        title="Retry failed badge emails"
        confirmLabel="Queue emails"
        onClose={() => setConfirmRetryEmails(false)}
        onConfirm={async () => {
          const result = await api.admin.resendFailedBadgeEmails();
          setFeedback({ tone: 'success', message: `${result.queued} badge email(s) queued.` });
          void loadData();
        }}
      >
        <p style={{ margin: 0 }}>
          {failedEmails} failed badge email(s) will be sent again to the address on file. Fix wrong
          addresses first by opening the team.
        </p>
      </ConfirmActionDialog>
    </div>
  );
}
