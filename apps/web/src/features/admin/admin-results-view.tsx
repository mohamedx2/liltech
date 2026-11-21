'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHALLENGE_SCORE_MAX,
  CHALLENGE_WEIGHTS,
  CTF_MAX_POINTS,
  type AdminResultsResponse,
  type TeamChallengeScore,
  type TeamResult,
  type UpdateTeamScoresRequest,
} from 'api-contracts';
import { api } from '@/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FormField, TextInput } from '@/components/ui/input';
import { DataTable, type TableColumn } from '@/components/ui/table';
import { ConfirmActionDialog, errorMessage, FeedbackBanner, type Feedback } from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Results board: every active team's Mini-CTF points, both challenge scores
 * and the final score out of 100, ranked. Administrators can override any of
 * the three for a team; an empty field falls back to the computed value
 * (automatic Mini-CTF points, or the jurors' average). The server computes
 * every number shown here.
 */

const REFRESH_INTERVAL_MS = 30_000;

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

function challengeAt(team: TeamResult, position: 1 | 2): TeamChallengeScore | undefined {
  return team.challenges.find((challenge) => challenge.position === position);
}

interface ScoreForm {
  ctfPoints: string;
  challenge1Score: string;
  challenge2Score: string;
}

function formFor(team: TeamResult): ScoreForm {
  const asText = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);
  return {
    ctfPoints: asText(team.ctf.override),
    challenge1Score: asText(challengeAt(team, 1)?.override),
    challenge2Score: asText(challengeAt(team, 2)?.override),
  };
}

/** `undefined` when the text is not a valid score within `[0, max]`. */
function parseScore(text: string, max: number): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > max) return undefined;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return undefined;
  return value;
}

/** Only the overrides that changed, so the audit trail names real edits. */
function changedScores(team: TeamResult, form: ScoreForm): UpdateTeamScoresRequest | null {
  const request: Record<string, number | null> = {};
  const fields: Array<[keyof ScoreForm, number, number | null | undefined]> = [
    ['ctfPoints', CTF_MAX_POINTS, team.ctf.override],
    ['challenge1Score', CHALLENGE_SCORE_MAX, challengeAt(team, 1)?.override],
    ['challenge2Score', CHALLENGE_SCORE_MAX, challengeAt(team, 2)?.override],
  ];
  for (const [key, max, current] of fields) {
    const next = parseScore(form[key], max);
    if (next === undefined) return null;
    if (next !== (current ?? null)) request[key] = next;
  }
  return Object.keys(request).length > 0 ? (request as UpdateTeamScoresRequest) : null;
}

function formIsValid(form: ScoreForm): boolean {
  return (
    parseScore(form.ctfPoints, CTF_MAX_POINTS) !== undefined &&
    parseScore(form.challenge1Score, CHALLENGE_SCORE_MAX) !== undefined &&
    parseScore(form.challenge2Score, CHALLENGE_SCORE_MAX) !== undefined
  );
}

function ChallengeCell({ challenge }: { challenge: TeamChallengeScore | undefined }) {
  if (!challenge) return <span className={styles.muted}>—</span>;
  return (
    <div className={styles.cellStack}>
      <span className={styles.strong}>
        {formatScore(challenge.points)} pts
        {challenge.override !== null ? (
          <>
            {' '}
            <Badge tone="warning">Edited</Badge>
          </>
        ) : null}
      </span>
      <span className={styles.small}>
        {formatScore(challenge.score)}/100 ·{' '}
        {challenge.jurorCount === 0
          ? 'not scored'
          : `${challenge.jurorCount} juror${challenge.jurorCount > 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

export function AdminResultsView() {
  const [results, setResults] = useState<AdminResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [editing, setEditing] = useState<TeamResult | null>(null);
  const [form, setForm] = useState<ScoreForm>({
    ctfPoints: '',
    challenge1Score: '',
    challenge2Score: '',
  });

  const loadData = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      setResults(await api.admin.getResults());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load the results.'));
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
      if (document.visibilityState === 'visible' && editing === null) {
        void loadData({ quiet: true });
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadData, editing]);

  const openEditor = (team: TeamResult) => {
    setForm(formFor(team));
    setFeedback(null);
    setEditing(team);
  };

  const saveScores = async () => {
    if (!editing) return;
    const request = changedScores(editing, form);
    if (request) {
      await api.admin.updateTeamScores(editing.teamId, request);
      setFeedback({ tone: 'success', message: `Scores of ${editing.teamName} updated.` });
      await loadData({ quiet: true });
    }
    setEditing(null);
  };

  if (isLoading && results === null) {
    return <LoadingState message="Loading the results..." />;
  }

  if (results === null) {
    return (
      <ErrorState
        title="Results Unavailable"
        message={loadError ?? 'Failed to load the results.'}
        onRetry={() => void loadData()}
      />
    );
  }

  const columns: TableColumn<TeamResult>[] = [
    {
      key: 'rank',
      header: 'Rank',
      render: (team) => <span className={styles.strong}>#{team.rank}</span>,
    },
    { key: 'team', header: 'Team', render: (team) => team.teamName },
    {
      key: 'ctf',
      header: `Mini-CTF (/${CTF_MAX_POINTS})`,
      render: (team) => (
        <span className={styles.strong}>
          {formatScore(team.ctf.points)} pts
          {team.ctf.override !== null ? (
            <>
              {' '}
              <Badge tone="warning">Edited</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: 'c1',
      header: `Challenge 1 (/${CHALLENGE_WEIGHTS[1]})`,
      render: (team) => <ChallengeCell challenge={challengeAt(team, 1)} />,
    },
    {
      key: 'c2',
      header: `Challenge 2 (/${CHALLENGE_WEIGHTS[2]})`,
      render: (team) => <ChallengeCell challenge={challengeAt(team, 2)} />,
    },
    {
      key: 'total',
      header: 'Total (/100)',
      render: (team) => <span className={styles.strong}>{formatScore(team.total)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (team) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openEditor(team)}
          aria-label={`Edit the scores of ${team.teamName}`}
        >
          Edit scores
        </Button>
      ),
    },
  ];

  const scoreField = (key: keyof ScoreForm, label: string, max: number, computed: string) => (
    <FormField
      label={label}
      hint={`0–${max}. Leave empty to use the computed value (${computed}).`}
      error={
        parseScore(form[key], max) === undefined ? `Enter a number from 0 to ${max}.` : undefined
      }
    >
      {({ id, describedBy, invalid }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.01}
          value={form[key]}
          onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        />
      )}
    </FormField>
  );

  const editingC1 = editing ? challengeAt(editing, 1) : undefined;
  const editingC2 = editing ? challengeAt(editing, 2) : undefined;
  const juryText = (challenge: TeamChallengeScore | undefined) =>
    challenge?.juryAverage === null || challenge?.juryAverage === undefined
      ? 'no jury score yet, 0'
      : `jury average ${formatScore(challenge.juryAverage)}`;

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="results-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Results & Podiums</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadData({ quiet: true })}
            aria-label="Refresh the results"
          >
            <Icon name="refresh" /> Refresh
          </Button>
        </div>
        <h1 id="results-title" className={styles.title}>
          Results
        </h1>
        <p className={styles.description}>
          Final score out of 100: Mini-CTF {CTF_MAX_POINTS} pts + Challenge 1 {CHALLENGE_WEIGHTS[1]}
          % + Challenge 2 {CHALLENGE_WEIGHTS[2]}%. Challenge scores are the jurors&apos; average (0
          until scored). &ldquo;Edited&rdquo; marks an administrator override.
        </p>
      </section>

      <FeedbackBanner feedback={feedback} />
      {loadError ? <FeedbackBanner feedback={{ tone: 'error', message: loadError }} /> : null}

      <section className={styles.panel} aria-label="Ranking">
        {results.teams.length === 0 ? (
          <EmptyState title="No active team" message="Teams appear here once they register." />
        ) : (
          <DataTable
            caption="Teams ranked by final score"
            columns={columns}
            rows={results.teams}
            getRowKey={(team) => team.teamId}
          />
        )}
      </section>

      {editing ? (
        <ConfirmActionDialog
          open
          title={`Edit scores — ${editing.teamName}`}
          confirmLabel="Save scores"
          confirmDisabled={!formIsValid(form)}
          onConfirm={saveScores}
          onClose={() => setEditing(null)}
        >
          <div className={styles.form}>
            {scoreField(
              'ctfPoints',
              'Mini-CTF points',
              CTF_MAX_POINTS,
              editing.ctf.automatic === null
                ? 'not solved, 0'
                : `automatic ${formatScore(editing.ctf.automatic)}`,
            )}
            {scoreField(
              'challenge1Score',
              'Challenge 1 score (out of 100)',
              CHALLENGE_SCORE_MAX,
              juryText(editingC1),
            )}
            {scoreField(
              'challenge2Score',
              'Challenge 2 score (out of 100)',
              CHALLENGE_SCORE_MAX,
              juryText(editingC2),
            )}
          </div>
        </ConfirmActionDialog>
      ) : null}
    </div>
  );
}
