'use client';

import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ChallengeAdminDetail, ChallengeStatus, EventPhase } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { ErrorState, EmptyState, LoadingState } from '@/components/feedback/state-panel';
import { Alert } from '@/components/feedback/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Textarea, TextInput } from '@/components/ui/input';
import styles from './admin-challenges-view.module.css';

const STATUS_TONE: Record<ChallengeStatus, BadgeTone> = {
  upcoming: 'neutral',
  live: 'success',
  ended: 'info',
};

const STATUS_LABEL: Record<ChallengeStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Running',
  ended: 'Ended',
};

interface ChallengeForm {
  position: string;
  title: string;
  summary: string;
  description: string;
  problemStatement: string;
  /** One deliverable per line. */
  deliverables: string;
  /** One resource per line: `Name | https://url`. */
  resources: string;
  publicDelayMinutes: string;
}

type FieldErrors = Partial<Record<keyof ChallengeForm, string>>;

function emptyForm(nextPosition: number): ChallengeForm {
  return {
    position: String(nextPosition),
    title: '',
    summary: '',
    description: '',
    problemStatement: '',
    deliverables: '',
    resources: '',
    publicDelayMinutes: '60',
  };
}

function formFrom(challenge: ChallengeAdminDetail): ChallengeForm {
  return {
    position: String(challenge.position),
    title: challenge.title,
    summary: challenge.summary,
    description: challenge.description,
    problemStatement: challenge.problemStatement,
    deliverables: challenge.deliverables.join('\n'),
    resources: challenge.resources.map((r) => `${r.name} | ${r.url}`).join('\n'),
    publicDelayMinutes: String(challenge.publicDelayMinutes),
  };
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseResources(value: string): { name: string; url: string }[] | null {
  const parsed = lines(value).map((line) => {
    const [name, ...rest] = line.split('|');
    return { name: name.trim(), url: rest.join('|').trim() };
  });
  return parsed.every((r) => r.name && /^https?:\/\/\S+$/.test(r.url)) ? parsed : null;
}

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/** API field paths (`deliverables.0`, `resources.1.url`) → form fields. */
function serverFieldErrors(error: ApiClientError): FieldErrors {
  const errors: FieldErrors = {};
  if (!Array.isArray(error.details)) return errors;
  for (const detail of error.details) {
    const { path, message } = (detail ?? {}) as { path?: unknown; message?: unknown };
    if (typeof path !== 'string' || typeof message !== 'string') continue;
    const root = path.split('.')[0] as keyof ChallengeForm;
    if (root in emptyForm(1)) errors[root] ??= message;
  }
  return errors;
}

type PendingAction = { kind: 'start' | 'end'; challenge: ChallengeAdminDetail };

/**
 * Challenge administration: content for each of the two challenges, and the
 * start/end controls. The server only accepts start/end while the event is
 * `live`, one challenge at a time, in order; the buttons mirror those rules
 * but the server stays the authority.
 */
export function AdminChallengesView() {
  const [challenges, setChallenges] = useState<ChallengeAdminDetail[] | null>(null);
  const [phase, setPhase] = useState<EventPhase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editing, setEditing] = useState<ChallengeAdminDetail | 'new' | null>(null);
  const [form, setForm] = useState<ChallengeForm>(emptyForm(1));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isActing, setIsActing] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [list, eventState] = await Promise.all([
        api.admin.getChallenges(),
        api.events.getEventState(),
      ]);
      setChallenges(list.items);
      setPhase(eventState.phase);
    } catch (err) {
      setErrorMessage(err instanceof ApiClientError ? err.message : 'Failed to load challenges.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nextPosition =
    (challenges ?? []).reduce((max, challenge) => Math.max(max, challenge.position), 0) + 1;

  const openCreate = () => {
    setEditing('new');
    setForm(emptyForm(nextPosition));
    setFieldErrors({});
    setFormError(null);
  };

  const openEdit = (challenge: ChallengeAdminDetail) => {
    setEditing(challenge);
    setForm(formFrom(challenge));
    setFieldErrors({});
    setFormError(null);
  };

  const closeForm = () => {
    if (!isSaving) setEditing(null);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!editing) return;

    const errors: FieldErrors = {};
    const position = Number(form.position);
    const delay = Number(form.publicDelayMinutes);
    const resources = parseResources(form.resources);
    if (editing === 'new' && (!Number.isInteger(position) || position < 1)) {
      errors.position = 'Use 1 for the first challenge, 2 for the second.';
    }
    if (!form.title.trim()) errors.title = 'Enter a title.';
    if (!form.description.trim()) errors.description = 'Enter the description teams will read.';
    if (!Number.isInteger(delay) || delay < 0 || delay > 1440) {
      errors.publicDelayMinutes = 'Enter a number of minutes between 0 and 1440.';
    }
    if (!resources) errors.resources = 'Write one resource per line as “Name | https://link”.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !resources) return;

    const content = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      description: form.description.trim(),
      problemStatement: form.problemStatement.trim(),
      deliverables: lines(form.deliverables),
      resources,
      publicDelayMinutes: delay,
    };

    setIsSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') {
        await api.admin.createChallenge({ position, ...content });
        setSuccessMessage(`Challenge ${position} created.`);
      } else {
        await api.admin.updateChallenge(editing.id, content);
        setSuccessMessage(`“${content.title}” saved.`);
      }
      setEditing(null);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(serverFieldErrors(err));
        setFormError(err.message);
      } else {
        setFormError('Could not save the challenge.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const runPending = async () => {
    if (!pending) return;
    setIsActing(true);
    setErrorMessage(null);
    try {
      const updated =
        pending.kind === 'start'
          ? await api.admin.startChallenge(pending.challenge.id)
          : await api.admin.endChallenge(pending.challenge.id);
      setSuccessMessage(
        pending.kind === 'start'
          ? `“${updated.title}” started. It opens for every team at ${formatTime(updated.publicAt)}.`
          : `“${updated.title}” ended.`,
      );
      setPending(null);
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof ApiClientError ? err.message : 'The action failed.');
      setPending(null);
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading && challenges === null) {
    return <LoadingState message="Loading challenges..." />;
  }

  if (errorMessage && challenges === null) {
    return <ErrorState title="Challenges Unavailable" message={errorMessage} onRetry={loadData} />;
  }

  const isLive = phase === 'live';
  const running = (challenges ?? []).find((challenge) => challenge.status === 'live');
  const canStart = (challenge: ChallengeAdminDetail) =>
    isLive &&
    challenge.status === 'upcoming' &&
    !running &&
    (challenges ?? []).every(
      (other) => other.position >= challenge.position || other.status === 'ended',
    );
  const isNew = editing === 'new';

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="challenges-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Challenges</span>
          <Button type="button" variant="primary" size="sm" onClick={openCreate}>
            Add challenge
          </Button>
        </div>
        <h1 id="challenges-title" className={styles.title}>
          Challenges
        </h1>
        <p className={styles.description}>
          Two challenges run one after the other. Start a challenge to open it to teams that solved
          its Mini-CTF; every other team can read it after the public delay. Start and end are only
          possible while the event is live.
        </p>
        <div className={styles.phaseRow}>
          <span className={styles.muted}>Event phase:</span>
          <Badge tone={isLive ? 'success' : 'warning'} showDot>
            {phase ? phase.replace('_', ' ') : 'unknown'}
          </Badge>
          {!isLive ? (
            <span className={styles.muted}>Switch the event to “live” to start challenges.</span>
          ) : null}
        </div>
      </section>

      {successMessage ? (
        <Alert tone="success" title="Done">
          {successMessage}
        </Alert>
      ) : null}
      {errorMessage && challenges !== null ? (
        <Alert tone="error" title="Action refused">
          {errorMessage}
        </Alert>
      ) : null}

      {challenges && challenges.length > 0 ? (
        <ul className={styles.list}>
          {challenges.map((challenge) => (
            <li key={challenge.id} className={styles.panel}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.eyebrow}>Challenge {challenge.position}</span>
                  <h2 className={styles.sectionTitle}>{challenge.title}</h2>
                </div>
                <Badge tone={STATUS_TONE[challenge.status]} showDot>
                  {STATUS_LABEL[challenge.status]}
                </Badge>
              </div>

              {challenge.summary ? <p className={styles.description}>{challenge.summary}</p> : null}

              <dl className={styles.facts}>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTime(challenge.startedAt)}</dd>
                </div>
                <div>
                  <dt>Open to everyone</dt>
                  <dd>
                    {challenge.publicAt
                      ? formatTime(challenge.publicAt)
                      : `${challenge.publicDelayMinutes} min after start`}
                  </dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatTime(challenge.endedAt)}</dd>
                </div>
                <div>
                  <dt>Mini-CTF solved by</dt>
                  <dd>
                    {challenge.ctfSolvedTeams} team{challenge.ctfSolvedTeams === 1 ? '' : 's'}
                  </dd>
                </div>
              </dl>

              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(challenge)}
                >
                  Edit content
                </Button>
                {challenge.status === 'upcoming' ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!canStart(challenge)}
                    onClick={() => setPending({ kind: 'start', challenge })}
                  >
                    Start challenge
                  </Button>
                ) : null}
                {challenge.status === 'live' ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={!isLive}
                    onClick={() => setPending({ kind: 'end', challenge })}
                  >
                    End challenge
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No challenges yet"
          message="Use “Add challenge” to create challenge 1, then challenge 2."
        />
      )}

      {editing ? (
        <Dialog
          open={editing !== null}
          onClose={closeForm}
          title={isNew ? 'Add challenge' : `Edit “${editing.title}”`}
          footer={
            <div className={styles.dialogFooter}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeForm}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="challenge-form"
                variant="primary"
                size="sm"
                loading={isSaving}
                loadingLabel="Saving…"
              >
                {isNew ? 'Create challenge' : 'Save changes'}
              </Button>
            </div>
          }
        >
          <form id="challenge-form" className={styles.form} onSubmit={handleSubmit} noValidate>
            {formError ? (
              <Alert tone="error" title="Could not save">
                {formError}
              </Alert>
            ) : null}
            <div className={styles.formRow}>
              {isNew ? (
                <FormField label="Order" required hint="1 or 2" error={fieldErrors.position}>
                  {({ id, describedBy, invalid }) => (
                    <TextInput
                      id={id}
                      type="number"
                      min={1}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={form.position}
                      onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    />
                  )}
                </FormField>
              ) : null}
              <FormField
                label="Public delay (minutes)"
                required
                hint="Time after the start before every team can read it."
                error={fieldErrors.publicDelayMinutes}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="number"
                    min={0}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={form.publicDelayMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, publicDelayMinutes: e.target.value }))}
                  />
                )}
              </FormField>
            </div>
            <FormField label="Title" required error={fieldErrors.title}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              )}
            </FormField>
            <FormField
              label="Teaser"
              hint="Shown to every team, even before the description unlocks."
              error={fieldErrors.summary}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Description" required error={fieldErrors.description}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  rows={5}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Problem statement" error={fieldErrors.problemStatement}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  rows={4}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.problemStatement}
                  onChange={(e) => setForm((f) => ({ ...f, problemStatement: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Deliverables" hint="One per line." error={fieldErrors.deliverables}>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  rows={3}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.deliverables}
                  onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))}
                />
              )}
            </FormField>
            <FormField
              label="Resources"
              hint="One per line: Name | https://link"
              error={fieldErrors.resources}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  rows={3}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.resources}
                  onChange={(e) => setForm((f) => ({ ...f, resources: e.target.value }))}
                />
              )}
            </FormField>
          </form>
        </Dialog>
      ) : null}

      {pending ? (
        <Dialog
          open={pending !== null}
          onClose={() => !isActing && setPending(null)}
          title={pending.kind === 'start' ? 'Start challenge' : 'End challenge'}
          footer={
            <div className={styles.dialogFooter}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPending(null)}
                disabled={isActing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={pending.kind === 'start' ? 'primary' : 'danger'}
                size="sm"
                loading={isActing}
                loadingLabel={pending.kind === 'start' ? 'Starting…' : 'Ending…'}
                onClick={runPending}
              >
                {pending.kind === 'start' ? 'Start now' : 'End now'}
              </Button>
            </div>
          }
        >
          <Alert tone="warning" title={pending.challenge.title}>
            {pending.kind === 'start'
              ? `Teams that solved this challenge's Mini-CTF can read it immediately. Every other team can read it ${pending.challenge.publicDelayMinutes} minutes from now. A started challenge cannot be restarted.`
              : 'Ending opens the description to every team and lets the next challenge start. An ended challenge cannot be restarted.'}
          </Alert>
        </Dialog>
      ) : null}
    </div>
  );
}
