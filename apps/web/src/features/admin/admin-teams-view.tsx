'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { TeamResponse } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { ErrorState, EmptyState, LoadingState } from '@/components/feedback/state-panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { DataTable } from '@/components/ui/table';
import styles from './admin-teams-view.module.css';

/**
 * Team roster for administrators: every registered team with its progress and
 * per-participant check-in state. Operational view — fast, no decoration.
 */

const PROGRESS_TONE: Record<string, BadgeTone> = {
  registered: 'neutral',
  checked_in: 'info',
  ctf_unlocked: 'warning',
  ctf_solved: 'warning',
  challenge_unlocked: 'info',
  submitted: 'success',
};

function progressLabel(state: string): string {
  return state.replace('_', ' ');
}

export function AdminTeamsView() {
  const [teams, setTeams] = useState<TeamResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const roster = await api.admin.getTeams();
      setTeams(roster.items);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.message : 'Failed to load the team roster.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading && teams === null) {
    return <LoadingState message="Loading the team roster..." />;
  }

  if (errorMessage && teams === null) {
    return <ErrorState title="Team Roster Unavailable" message={errorMessage} onRetry={loadData} />;
  }

  if (!teams || teams.length === 0) {
    return (
      <div className={styles.container}>
        <RosterHeader totalTeams={0} totalParticipants={0} totalCheckedIn={0} />
        <EmptyState
          title="No teams registered yet"
          message="Teams appear here as soon as leaders complete registration."
        />
      </div>
    );
  }

  const totalParticipants = teams.reduce((sum, team) => sum + team.participants.length, 0);
  const totalCheckedIn = teams.reduce(
    (sum, team) => sum + team.participants.filter((p) => p.checkedInAt).length,
    0,
  );

  return (
    <div className={styles.container}>
      <RosterHeader
        totalTeams={teams.length}
        totalParticipants={totalParticipants}
        totalCheckedIn={totalCheckedIn}
      />

      <section aria-labelledby="teams-table-heading" className={styles.panel}>
        <h2 id="teams-table-heading" className={styles.sectionTitle}>
          Registered teams ({teams.length})
        </h2>
        <DataTable
          caption="All registered teams with progress and check-in state"
          rows={teams}
          getRowKey={(team) => team.id}
          columns={[
            {
              key: 'name',
              header: 'Team',
              render: (team) => (
                <div className={styles.teamCell}>
                  <span className={styles.teamName}>{team.name}</span>
                  <span className={styles.leaderName}>Leader: {team.leader.name || '—'}</span>
                </div>
              ),
            },
            {
              key: 'progress',
              header: 'Progress',
              render: (team) => (
                <Badge tone={PROGRESS_TONE[team.progressState] ?? 'neutral'}>
                  {progressLabel(team.progressState)}
                </Badge>
              ),
            },
            {
              key: 'participants',
              header: 'Members',
              render: (team) => (
                <ul className={styles.participantList}>
                  {team.participants.map((participant) => (
                    <li key={participant.id} className={styles.participantItem}>
                      <span>
                        {participant.isLeader ? (
                          <span title="Team Leader">
                            <Icon name="star" className={styles.leaderIcon} />
                          </span>
                        ) : null}
                        {participant.name}
                      </span>
                      {participant.checkedInAt ? (
                        <Badge tone="success" showDot>
                          Checked in
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Not checked in</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: 'createdAt',
              header: 'Registered',
              render: (team) =>
                new Date(team.createdAt).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
            },
          ]}
        />
      </section>
    </div>
  );
}

function RosterHeader({
  totalTeams,
  totalParticipants,
  totalCheckedIn,
}: {
  totalTeams: number;
  totalParticipants: number;
  totalCheckedIn: number;
}) {
  return (
    <section className={styles.hero} aria-labelledby="teams-title">
      <span className={styles.eyebrow}>Registration Overview</span>
      <h1 id="teams-title" className={styles.title}>
        Teams
      </h1>
      <p className={styles.description}>
        Live roster from the backend — registration records, team progress, and entrance check-in
        state for every participant.
      </p>
      <dl className={styles.statRow}>
        <div className={styles.stat}>
          <dt>Teams</dt>
          <dd>{totalTeams}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Participants</dt>
          <dd>{totalParticipants}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Checked in</dt>
          <dd>{totalCheckedIn}</dd>
        </div>
      </dl>
    </section>
  );
}
