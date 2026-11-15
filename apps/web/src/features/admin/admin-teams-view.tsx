'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { TeamResponse } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { ErrorState, EmptyState, LoadingState } from '@/components/feedback/state-panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { DataTable } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, TextInput } from '@/components/ui/input';
import { Alert } from '@/components/feedback/alert';
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

type BadgeEmailStatus = 'pending' | 'sent' | 'failed' | null | undefined;

const EMAIL_STATUS: Record<
  'pending' | 'sent' | 'failed' | 'none',
  { tone: BadgeTone; label: string }
> = {
  sent: { tone: 'success', label: 'Email sent' },
  pending: { tone: 'info', label: 'Sending…' },
  failed: { tone: 'danger', label: 'Email failed' },
  none: { tone: 'warning', label: 'Not emailed' },
};

/** Sends one participant's badge email on demand (admins are not rate limited). */
function ResendBadgeEmail({
  participantId,
  participantName,
  email,
  status,
}: {
  participantId: string;
  participantName: string;
  email: string | null | undefined;
  status: BadgeEmailStatus;
}) {
  const [current, setCurrent] = useState<BadgeEmailStatus>(status);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!email) {
    return <span className={styles.emailResult}>No email</span>;
  }

  const send = async () => {
    setIsSending(true);
    setError(null);
    try {
      const result = await api.admin.resendBadgeEmail(participantId);
      setCurrent(result.emailStatus);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send the email.');
    } finally {
      setIsSending(false);
    }
  };

  const display = EMAIL_STATUS[current ?? 'none'];

  return (
    <span className={styles.emailRow}>
      <Badge tone={display.tone}>{display.label}</Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={send}
        loading={isSending}
        loadingLabel="Sending…"
        aria-label={`Send badge email to ${participantName}`}
        title={email}
      >
        {current === 'sent' ? 'Resend' : 'Send'}
      </Button>
      {error ? (
        <span role="alert" className={styles.emailResult}>
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Admin password reset for a team account (the shared login). The old
 * password cannot be shown: the server only keeps its hash.
 */
function ResetTeamPassword({ team }: { team: TeamResponse }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    if (isSaving) return;
    setOpen(false);
    setPassword('');
    setError(null);
    setResult(null);
    setCopied(false);
  };

  const submit = async () => {
    if (password && password.length < 12) {
      setError('Use at least 12 characters, or leave it empty to generate one.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const reset = await api.admin.resetTeamPassword(team.id, password || undefined);
      setResult({ email: reset.email, password: reset.password });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reset the password.');
    } finally {
      setIsSaving(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Reset the password of ${team.name}`}
        title="Set a new password for this team's login"
      >
        Reset password
      </Button>
      {open ? (
        <Dialog
          open={open}
          onClose={close}
          title={`Reset password: ${team.name}`}
          footer={
            <div className={styles.dialogFooter}>
              {result ? (
                <Button type="button" variant="primary" size="sm" onClick={close}>
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={close}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={isSaving}
                    loadingLabel="Resetting…"
                    onClick={submit}
                  >
                    Set new password
                  </Button>
                </>
              )}
            </div>
          }
        >
          {result ? (
            <div className={styles.resetResult}>
              <Alert tone="success" title="New login for this team">
                Give these to the team. This password is shown only now.
              </Alert>
              <dl className={styles.credentials}>
                <div>
                  <dt>Email</dt>
                  <dd>{result.email}</dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>
                    <code className={styles.password}>{result.password}</code>
                    <Button type="button" variant="ghost" size="sm" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className={styles.resetResult}>
              <Alert tone="warning" title="The current password cannot be shown">
                Only a secure hash of it is stored. Setting a new one signs every member of this
                team out until they log in with it.
              </Alert>
              {error ? (
                <Alert tone="error" title="Could not reset">
                  {error}
                </Alert>
              ) : null}
              <FormField
                label="New password"
                hint="Leave empty to generate a strong password automatically."
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="text"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </FormField>
            </div>
          )}
        </Dialog>
      ) : null}
    </>
  );
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
                  <ResetTeamPassword team={team} />
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
                      <span className={styles.participantName}>
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
                      <ResendBadgeEmail
                        participantId={participant.id}
                        participantName={participant.name}
                        email={participant.email}
                        status={participant.badgeEmailStatus}
                      />
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
