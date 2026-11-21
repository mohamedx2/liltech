'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { AdminJuryAccount, ChallengeAdminDetail } from 'api-contracts';
import { api } from '@/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Button } from '@/components/ui/button';
import { FormField, Select, TextInput } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/table';
import {
  ConfirmActionDialog,
  errorMessage,
  FeedbackBanner,
  formatTime,
  type Feedback,
} from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Jury account management: create accounts (the server can generate the
 * password), read a password back to a jury member who forgot it, change
 * it (their sessions end), assign the challenge each juror scores, and delete
 * accounts. Jury passwords are readable
 * to administrators by organizer decision (AGENTS.md §9).
 */

type PendingAction =
  | { kind: 'create' }
  | { kind: 'edit'; account: AdminJuryAccount }
  | { kind: 'delete'; account: AdminJuryAccount };

const PASSWORD_MIN = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminJuryView() {
  const [accounts, setAccounts] = useState<AdminJuryAccount[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenges, setChallenges] = useState<ChallengeAdminDetail[]>([]);
  /** '' means "not assigned yet". */
  const [challengeField, setChallengeField] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [jury, challengeList] = await Promise.all([
        api.admin.getJuryAccounts(),
        // The roster stays usable even if the challenge list cannot load.
        api.admin.getChallenges().catch(() => ({ items: [], total: 0 })),
      ]);
      setAccounts(jury.items);
      setChallenges([...challengeList.items].sort((a, b) => a.position - b.position));
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load jury accounts.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const open = (action: PendingAction) => {
    setFeedback(null);
    setName(action.kind === 'edit' ? action.account.name : '');
    setEmail(action.kind === 'edit' ? action.account.email : '');
    setPassword('');
    setChallengeField(action.kind === 'edit' ? (action.account.challengeId ?? '') : '');
    setPending(action);
  };

  const toggleReveal = (id: string) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runPending = async () => {
    if (!pending) return;
    if (pending.kind === 'create') {
      const created = await api.admin.createJuryAccount({
        name: name.trim(),
        email: email.trim(),
        ...(password ? { password } : {}),
        challengeId: challengeField || null,
      });
      setAccounts((current) => [created, ...(current ?? [])]);
      setRevealed((current) => new Set(current).add(created.id));
      setFeedback({
        tone: 'success',
        message: `Jury account for ${created.name} created. Hand them the password shown below.`,
      });
    } else if (pending.kind === 'edit') {
      const changes = {
        ...(name.trim() !== pending.account.name ? { name: name.trim() } : {}),
        ...(email.trim() !== pending.account.email ? { email: email.trim() } : {}),
        ...(password ? { password } : {}),
        ...((challengeField || null) !== pending.account.challengeId
          ? { challengeId: challengeField || null }
          : {}),
      };
      const updated = await api.admin.updateJuryAccount(pending.account.id, changes);
      setAccounts((current) =>
        (current ?? []).map((account) => (account.id === updated.id ? updated : account)),
      );
      setFeedback({
        tone: 'success',
        message: password
          ? `${updated.name} updated. Their open sessions were signed out.`
          : `${updated.name} updated.`,
      });
    } else {
      await api.admin.deleteJuryAccount(pending.account.id);
      setAccounts((current) =>
        (current ?? []).filter((account) => account.id !== pending.account.id),
      );
      setFeedback({ tone: 'success', message: `${pending.account.name}'s jury account deleted.` });
    }
  };

  if (isLoading && accounts === null) {
    return <LoadingState message="Loading jury accounts..." />;
  }

  if (loadError && accounts === null) {
    return <ErrorState title="Jury Roster Unavailable" message={loadError} onRetry={loadData} />;
  }

  const passwordInvalid = password.length > 0 && password.length < PASSWORD_MIN;
  const formInvalid = !name.trim() || !EMAIL_PATTERN.test(email.trim()) || passwordInvalid;
  const editUnchanged =
    pending?.kind === 'edit' &&
    name.trim() === pending.account.name &&
    email.trim() === pending.account.email &&
    (challengeField || null) === pending.account.challengeId &&
    !password;

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="jury-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Evaluation Staff</span>
          <Button variant="primary" size="sm" onClick={() => open({ kind: 'create' })}>
            New jury account
          </Button>
        </div>
        <h1 id="jury-title" className={styles.title}>
          Jury
        </h1>
        <p className={styles.description}>
          Jury accounts with evaluation access. Assign each juror the challenge they score: they see
          only that challenge. Passwords are readable here so you can hand them to jury members;
          they are never shown anywhere else.
        </p>
      </section>

      <FeedbackBanner feedback={feedback} />

      <section aria-labelledby="jury-table-heading" className={styles.panel}>
        <h2 id="jury-table-heading" className={styles.sectionTitle}>
          Jury accounts ({accounts?.length ?? 0})
        </h2>
        {accounts && accounts.length > 0 ? (
          <DataTable
            caption="Jury accounts, newest first"
            rows={accounts}
            getRowKey={(account) => account.id}
            columns={[
              {
                key: 'name',
                header: 'Jury member',
                render: (account) => (
                  <div className={styles.cellStack}>
                    <span className={styles.strong}>{account.name}</span>
                    <span className={styles.small}>{account.email}</span>
                  </div>
                ),
              },
              {
                key: 'password',
                header: 'Password',
                render: (account) =>
                  account.password === null ? (
                    <span className={styles.small}>Not readable — set a new one</span>
                  ) : (
                    <div className={styles.actions}>
                      <code className={styles.small}>
                        {revealed.has(account.id) ? account.password : '••••••••••••'}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleReveal(account.id)}
                        aria-label={`${revealed.has(account.id) ? 'Hide' : 'Show'} password of ${account.name}`}
                      >
                        {revealed.has(account.id) ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  ),
              },
              {
                key: 'challenge',
                header: 'Scores',
                render: (account) =>
                  account.challengeTitle ? (
                    <span className={styles.strong}>{account.challengeTitle}</span>
                  ) : (
                    <Badge tone="warning">Not assigned</Badge>
                  ),
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (account) => formatTime(account.createdAt),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (account) => (
                  <div className={styles.actions}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open({ kind: 'edit', account })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => open({ kind: 'delete', account })}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="No jury accounts yet"
            message="Create one account per jury member before the pitches."
          />
        )}
      </section>

      {pending?.kind === 'create' || pending?.kind === 'edit' ? (
        <ConfirmActionDialog
          open
          title={pending.kind === 'create' ? 'New jury account' : `Edit ${pending.account.name}`}
          confirmLabel={pending.kind === 'create' ? 'Create account' : 'Save'}
          confirmDisabled={formInvalid || editUnchanged}
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <FormField label="Full name" required>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
              />
            )}
          </FormField>
          <FormField label="Email (login)" required>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Challenge (jury track)"
            hint="The juror scores every team on this challenge only. You can assign it later."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={challengeField}
                onChange={(event) => setChallengeField(event.target.value)}
              >
                <option value="">Not assigned yet</option>
                {challenges.map((challenge) => (
                  <option key={challenge.id} value={challenge.id}>
                    {`Challenge ${challenge.position} — ${challenge.title}`}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField
            label={pending.kind === 'create' ? 'Password (optional)' : 'New password (optional)'}
            hint={
              pending.kind === 'create'
                ? `Leave empty to generate a strong one. Minimum ${PASSWORD_MIN} characters.`
                : `Leave empty to keep the current one. Changing it signs the jury member out.`
            }
            error={passwordInvalid ? `At least ${PASSWORD_MIN} characters.` : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            )}
          </FormField>
        </ConfirmActionDialog>
      ) : null}

      {pending?.kind === 'delete' ? (
        <ConfirmActionDialog
          open
          title="Delete jury account"
          tone="danger"
          confirmLabel="Delete account"
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <p style={{ margin: 0 }}>
            Delete the account of <strong>{pending.account.name}</strong> ({pending.account.email})?
            They are signed out immediately. This cannot be undone. A juror who already scored teams
            cannot be deleted: unassign them instead.
          </p>
        </ConfirmActionDialog>
      ) : null}
    </div>
  );
}
