'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_CHALLENGE_PUBLIC_DELAY_MINUTES,
  type ChallengeAdminDetail,
  type ChallengeResourceLink,
} from 'api-contracts';
import { api } from '@/lib/api';
import { Alert } from '@/components/feedback/alert';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField, TextInput, Textarea } from '@/components/ui/input';
import {
  ConfirmActionDialog,
  errorMessage,
  FeedbackBanner,
  formatTime,
  type Feedback,
} from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Challenge administration: write the two challenges, run them one after
 * the other (start / end while the event is live), and control when every
 * team can read the running challenge (public delay, or reveal now).
 */

const STATUS_TONE: Record<ChallengeAdminDetail['status'], BadgeTone> = {
  upcoming: 'neutral',
  live: 'success',
  ended: 'info',
};

interface ChallengeForm {
  position: string;
  title: string;
  summary: string;
  description: string;
  problemStatement: string;
  deliverables: string;
  resources: string;
  publicDelayMinutes: string;
}

const EMPTY_FORM: ChallengeForm = {
  position: '1',
  title: '',
  summary: '',
  description: '',
  problemStatement: '',
  deliverables: '',
  resources: '',
  publicDelayMinutes: String(DEFAULT_CHALLENGE_PUBLIC_DELAY_MINUTES),
};

function toForm(challenge: ChallengeAdminDetail): ChallengeForm {
  return {
    position: String(challenge.position),
    title: challenge.title,
    summary: challenge.summary,
    description: challenge.description,
    problemStatement: challenge.problemStatement,
    deliverables: challenge.deliverables.join('\n'),
    resources: challenge.resources.map((link) => `${link.name} | ${link.url}`).join('\n'),
    publicDelayMinutes: String(challenge.publicDelayMinutes),
  };
}

/** One line per resource: `Name | https://url`. Invalid lines are reported. */
export function parseResources(text: string): {
  links: ChallengeResourceLink[];
  invalid: string[];
} {
  const links: ChallengeResourceLink[] = [];
  const invalid: string[] = [];
  for (const line of text
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)) {
    const [name, url] = line.split('|').map((part) => part.trim());
    if (name && url && /^https?:\/\//.test(url)) {
      links.push({ name, url });
    } else {
      invalid.push(line);
    }
  }
  return { links, invalid };
}

type PendingAction =
  | { kind: 'create' }
  | { kind: 'edit'; challenge: ChallengeAdminDetail }
  | { kind: 'start'; challenge: ChallengeAdminDetail }
  | { kind: 'end'; challenge: ChallengeAdminDetail }
  | { kind: 'reveal'; challenge: ChallengeAdminDetail };

export function AdminChallengesView() {
  const [challenges, setChallenges] = useState<ChallengeAdminDetail[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [form, setForm] = useState<ChallengeForm>(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setChallenges((await api.admin.getChallenges()).items);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load challenges.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const replace = (updated: ChallengeAdminDetail) =>
    setChallenges((current) => {
      const others = (current ?? []).filter((item) => item.id !== updated.id);
      return [...others, updated].sort((a, b) => a.position - b.position);
    });

  const openForm = (action: PendingAction) => {
    setFeedback(null);
    if (action.kind === 'create') {
      const nextPosition = (challenges ?? []).reduce((max, c) => Math.max(max, c.position), 0) + 1;
      setForm({ ...EMPTY_FORM, position: String(nextPosition) });
    } else if (action.kind === 'edit') {
      setForm(toForm(action.challenge));
    }
    setPending(action);
  };

  const resources = parseResources(form.resources);
  const delay = Number(form.publicDelayMinutes);
  const formValid =
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    resources.invalid.length === 0 &&
    Number.isInteger(delay) &&
    delay >= 0 &&
    delay <= 1440 &&
    Number.isInteger(Number(form.position)) &&
    Number(form.position) >= 1;

  const content = () => ({
    title: form.title.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    problemStatement: form.problemStatement.trim(),
    deliverables: form.deliverables
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    resources: resources.links,
    publicDelayMinutes: delay,
  });

  const runPending = async () => {
    if (!pending) return;
    switch (pending.kind) {
      case 'create': {
        const created = await api.admin.createChallenge({
          position: Number(form.position),
          ...content(),
        });
        replace(created);
        setFeedback({ tone: 'success', message: `“${created.title}” created.` });
        return;
      }
      case 'edit': {
        const updated = await api.admin.updateChallenge(pending.challenge.id, content());
        replace(updated);
        setFeedback({ tone: 'success', message: `“${updated.title}” saved.` });
        return;
      }
      case 'start': {
        const started = await api.admin.startChallenge(pending.challenge.id);
        replace(started);
        setFeedback({
          tone: 'success',
          message: `“${started.title}” started. Public to every team at ${formatTime(started.publicAt)}.`,
        });
        return;
      }
      case 'end': {
        const ended = await api.admin.endChallenge(pending.challenge.id);
        replace(ended);
        setFeedback({ tone: 'success', message: `“${ended.title}” ended.` });
        return;
      }
      case 'reveal': {
        const revealed = await api.admin.updateChallenge(pending.challenge.id, {
          publicDelayMinutes: 0,
        });
        replace(revealed);
        setFeedback({
          tone: 'success',
          message: `“${revealed.title}” is now readable by every team.`,
        });
        return;
      }
    }
  };

  if (isLoading && challenges === null) {
    return <LoadingState message="Loading challenges..." />;
  }

  if (loadError && challenges === null) {
    return <ErrorState title="Challenges unavailable" message={loadError} onRetry={loadData} />;
  }

  const list = challenges ?? [];

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="challenges-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Challenges</span>
          <Button variant="primary" size="sm" onClick={() => openForm({ kind: 'create' })}>
            New challenge
          </Button>
        </div>
        <h1 id="challenges-title" className={styles.title}>
          Challenges
        </h1>
        <p className={styles.description}>
          Challenges run one after the other, in position order, and can only start or end while the
          event phase is “live”. Teams that solved a challenge&apos;s Mini-CTF read it at once;
          everyone else after the public delay.
        </p>
      </section>

      <FeedbackBanner feedback={feedback} />

      {list.length === 0 ? (
        <EmptyState
          title="No challenge yet"
          message="Create the challenges before the event goes live."
          action={
            <Button variant="primary" size="sm" onClick={() => openForm({ kind: 'create' })}>
              New challenge
            </Button>
          }
        />
      ) : (
        list.map((challenge) => {
          const isRevealed =
            challenge.publicAt !== null && new Date(challenge.publicAt).getTime() <= Date.now();
          return (
            <section
              key={challenge.id}
              className={styles.panel}
              aria-labelledby={`challenge-${challenge.id}`}
            >
              <div className={styles.panelHeader}>
                <h2 id={`challenge-${challenge.id}`} className={styles.sectionTitle}>
                  {challenge.position}. {challenge.title}
                </h2>
                <Badge tone={STATUS_TONE[challenge.status]} showDot={challenge.status === 'live'}>
                  {challenge.status}
                </Badge>
              </div>
              {challenge.summary ? <p className={styles.description}>{challenge.summary}</p> : null}
              <dl className={styles.statGrid}>
                <div className={styles.stat}>
                  <dt>Started</dt>
                  <dd className={styles.small}>{formatTime(challenge.startedAt)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Public at</dt>
                  <dd className={styles.small}>
                    {challenge.publicAt
                      ? formatTime(challenge.publicAt)
                      : `start + ${challenge.publicDelayMinutes} min`}
                  </dd>
                </div>
                <div className={styles.stat}>
                  <dt>Ended</dt>
                  <dd className={styles.small}>{formatTime(challenge.endedAt)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Mini-CTF solvers</dt>
                  <dd>{challenge.ctfSolvedTeams}</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openForm({ kind: 'edit', challenge })}
                >
                  Edit content
                </Button>
                {challenge.status === 'upcoming' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openForm({ kind: 'start', challenge })}
                  >
                    Start challenge
                  </Button>
                ) : null}
                {challenge.status === 'live' && !isRevealed ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openForm({ kind: 'reveal', challenge })}
                  >
                    Reveal to all teams now
                  </Button>
                ) : null}
                {challenge.status === 'live' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => openForm({ kind: 'end', challenge })}
                  >
                    End challenge
                  </Button>
                ) : null}
              </div>
            </section>
          );
        })
      )}

      {pending?.kind === 'create' || pending?.kind === 'edit' ? (
        <ConfirmActionDialog
          open
          title={pending.kind === 'create' ? 'New challenge' : `Edit “${pending.challenge.title}”`}
          confirmLabel={pending.kind === 'create' ? 'Create challenge' : 'Save changes'}
          confirmDisabled={!formValid}
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <ChallengeFormFields
            form={form}
            onChange={setForm}
            positionEditable={pending.kind === 'create'}
            invalidResources={resources.invalid}
          />
          {pending.kind === 'edit' && pending.challenge.status === 'live' ? (
            <Alert tone="warning" title="Challenge is running">
              Teams with access see your changes immediately. Changing the delay moves the public
              reveal time.
            </Alert>
          ) : null}
        </ConfirmActionDialog>
      ) : null}

      {pending?.kind === 'start' ? (
        <ConfirmActionDialog
          open
          title="Start challenge"
          confirmLabel="Start now"
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <p style={{ margin: 0 }}>
            Start “{pending.challenge.title}” now? Mini-CTF solvers (
            {pending.challenge.ctfSolvedTeams} team(s)) can read it immediately; every team in{' '}
            {pending.challenge.publicDelayMinutes} minutes. A started challenge cannot be restarted.
          </p>
        </ConfirmActionDialog>
      ) : null}

      {pending?.kind === 'end' ? (
        <ConfirmActionDialog
          open
          title="End challenge"
          tone="danger"
          confirmLabel="End challenge"
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <p style={{ margin: 0 }}>
            End “{pending.challenge.title}”? It cannot be started again; its content stays readable
            to every team. The next challenge can then start.
          </p>
        </ConfirmActionDialog>
      ) : null}

      {pending?.kind === 'reveal' ? (
        <ConfirmActionDialog
          open
          title="Reveal to all teams now"
          confirmLabel="Reveal now"
          onConfirm={runPending}
          onClose={() => setPending(null)}
        >
          <p style={{ margin: 0 }}>
            Every team can read “{pending.challenge.title}” immediately, without waiting for the
            public delay. Mini-CTF solvers lose their head start.
          </p>
        </ConfirmActionDialog>
      ) : null}
    </div>
  );
}

function ChallengeFormFields({
  form,
  onChange,
  positionEditable,
  invalidResources,
}: {
  form: ChallengeForm;
  onChange: (form: ChallengeForm) => void;
  positionEditable: boolean;
  invalidResources: string[];
}) {
  const set =
    (field: keyof ChallengeForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [field]: event.target.value });

  return (
    <>
      <div className={styles.formRow}>
        <FormField label="Position (running order)" required>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="number"
              min={1}
              max={10}
              value={form.position}
              onChange={set('position')}
              disabled={!positionEditable}
            />
          )}
        </FormField>
        <FormField label="Public delay (minutes)" required hint="0 = every team at the start">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="number"
              min={0}
              max={1440}
              value={form.publicDelayMinutes}
              onChange={set('publicDelayMinutes')}
            />
          )}
        </FormField>
      </div>
      <FormField label="Title" required>
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            value={form.title}
            onChange={set('title')}
            maxLength={150}
          />
        )}
      </FormField>
      <FormField label="Teaser" hint="Shown to every team before the description unlocks.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={form.summary}
            onChange={set('summary')}
            maxLength={500}
            rows={2}
          />
        )}
      </FormField>
      <FormField label="Description" required>
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={form.description}
            onChange={set('description')}
            rows={5}
          />
        )}
      </FormField>
      <FormField label="Problem statement">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={form.problemStatement}
            onChange={set('problemStatement')}
            rows={4}
          />
        )}
      </FormField>
      <FormField label="Deliverables" hint="One per line.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={form.deliverables}
            onChange={set('deliverables')}
            rows={3}
          />
        )}
      </FormField>
      <FormField
        label="Resources"
        hint="One per line: Name | https://link"
        error={
          invalidResources.length > 0
            ? `Not a “Name | https://link” line: ${invalidResources[0]}`
            : undefined
        }
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={form.resources}
            onChange={set('resources')}
            rows={3}
          />
        )}
      </FormField>
    </>
  );
}
