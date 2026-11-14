'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { JuryOverviewResponse, JuryTeamItem } from '@/lib/api/contracts/pending';
import { getTrackLabel } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { DataTable, type TableColumn } from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './jury-overview-view.module.css';

type FilterTab = 'all' | 'pending' | 'graded';

export function JuryOverviewView() {
  const [overview, setOverview] = useState<JuryOverviewResponse | null>(null);
  const [teams, setTeams] = useState<JuryTeamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [overviewData, teamsData] = await Promise.all([
        api.jury.getOverview(),
        api.jury.getAssignedTeams(),
      ]);
      setOverview(overviewData);
      setTeams(teamsData);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load assigned teams for evaluation. Please retry.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        team.name.toLowerCase().includes(searchQuery.toLowerCase().trim());

      if (!matchesSearch) return false;

      if (activeTab === 'pending') {
        return team.evaluationStatus === 'pending';
      }
      if (activeTab === 'graded') {
        return team.evaluationStatus === 'graded';
      }
      return true;
    });
  }, [teams, searchQuery, activeTab]);

  const gradedCount = useMemo(
    () => teams.filter((t) => t.evaluationStatus === 'graded').length,
    [teams],
  );
  const pendingCount = useMemo(
    () => teams.filter((t) => t.evaluationStatus === 'pending').length,
    [teams],
  );

  const columns: TableColumn<JuryTeamItem>[] = [
    {
      key: 'team',
      header: 'Team Name & Track',
      render: (team) => (
        <div className={styles.teamCell}>
          <span className={styles.teamName}>{team.name}</span>
          <span className={styles.teamMeta}>
            {team.membersCount} participants • {getTrackLabel(team.track)}
          </span>
        </div>
      ),
    },
    {
      key: 'deliverables',
      header: 'Deliverables & Repository',
      render: (team) => (
        <div className={styles.deliverablesCell}>
          {team.submitted ? (
            <>
              <span className={styles.deliverableTitle}>
                {team.submissionTitle ?? 'Project Deliverable'}
              </span>
              <div className={styles.deliverableLinks}>
                {team.submissionRepoUrl ? (
                  <a
                    href={team.submissionRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.repoLink}
                    aria-label={`Open GitHub repository for ${team.name} in a new tab`}
                  >
                    <span>GitHub Repo ↗</span>
                  </a>
                ) : null}
                {team.submissionFileName ? (
                  <Badge tone="neutral">{team.submissionFileName}</Badge>
                ) : null}
              </div>
            </>
          ) : (
            <Badge tone="warning">Awaiting Deliverables</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Evaluation Status',
      render: (team) => (
        <div className={styles.scoreBadge}>
          {team.evaluationStatus === 'graded' ? (
            <Badge tone="success" showDot>
              Graded: {team.myScore ?? 0} / 100
            </Badge>
          ) : (
            <Badge tone="neutral" showDot>
              Pending Evaluation
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (team) => (
        <Link
          href={`/jury/evaluate/${team.id}`}
          className={buttonClassName({
            variant: team.evaluationStatus === 'graded' ? 'secondary' : 'primary',
            size: 'sm',
          })}
          aria-label={`${team.evaluationStatus === 'graded' ? 'Edit score for' : 'Evaluate'} ${team.name}`}
        >
          {team.evaluationStatus === 'graded' ? 'Edit Score' : 'Evaluate'}
        </Link>
      ),
    },
  ];

  if (isLoading) {
    return <LoadingState message="Loading your assigned challenge track and teams..." />;
  }

  if (errorMessage || !overview) {
    return (
      <ErrorState
        title="Jury Portal Unavailable"
        message={errorMessage ?? 'Could not retrieve assigned challenge track data.'}
        onRetry={loadData}
      />
    );
  }

  const completionPct =
    overview.totalTeams > 0 ? Math.round((overview.evaluatedTeams / overview.totalTeams) * 100) : 0;

  return (
    <div className={styles.container}>
      {/* Track & Evaluator Hero */}
      <section className={styles.hero} aria-labelledby="jury-track-heading">
        <div className={styles.heroTop}>
          <div className={styles.heroEyebrow}>
            <span className={styles.eyebrowText}>Jury Evaluation Workspace</span>
            <Badge tone="info" showDot>
              Phase: {overview.eventPhase.replace('_', ' ')}
            </Badge>
          </div>
          <Badge tone="neutral">Track-Scoped: {getTrackLabel(overview.track)}</Badge>
        </div>

        <h1 id="jury-track-heading" className={styles.heroTitle}>
          {overview.trackTitle}
        </h1>
        <p className={styles.heroDescription}>{overview.trackDescription}</p>
      </section>

      {/* Metrics Summary Grid */}
      <section className={styles.metricsGrid} aria-label="Evaluation summary statistics">
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Assigned Track Teams</span>
          <span className={styles.metricValue}>{overview.totalTeams}</span>
          <span className={styles.metricSubtext}>Teams competing in this track</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Evaluated by You</span>
          <span className={styles.metricValue}>
            {overview.evaluatedTeams} / {overview.totalTeams}
          </span>
          <span className={styles.metricSubtext}>{completionPct}% of track reviewed</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Pending Evaluation</span>
          <span className={styles.metricValue}>{overview.pendingTeams}</span>
          <span className={styles.metricSubtext}>Awaiting score submission</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Your Average Score</span>
          <span className={styles.metricValue}>
            {overview.averageScore !== null ? `${overview.averageScore}` : '—'}
          </span>
          <span className={styles.metricSubtext}>Across your graded teams</span>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon} aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assigned teams by name…"
            className={styles.searchInput}
            aria-label="Search assigned teams by name"
          />
        </div>

        <div
          className={styles.filterTabs}
          role="tablist"
          aria-label="Filter teams by evaluation status"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={styles.filterTab}
          >
            All Teams ({teams.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
            className={styles.filterTab}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'graded'}
            onClick={() => setActiveTab('graded')}
            className={styles.filterTab}
          >
            Graded ({gradedCount})
          </button>
        </div>
      </div>

      {/* Assigned Teams Table */}
      <section className={styles.tableSection} aria-label="Assigned Teams List">
        {filteredTeams.length > 0 ? (
          <DataTable
            caption={`Assigned teams for ${overview.trackTitle}`}
            columns={columns}
            rows={filteredTeams}
            getRowKey={(team) => team.id}
          />
        ) : (
          <div className={styles.emptyState}>
            <p>No teams match your search or filter criteria.</p>
            {searchQuery || activeTab !== 'all' ? (
              <button
                type="button"
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('all');
                }}
              >
                Reset Filters
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
