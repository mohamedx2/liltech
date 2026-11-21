'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  type ChallengeSubmissionState,
  type SubmissionBlockedReason,
  type SubmissionItem,
  type SubmissionsOverviewResponse,
} from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { formatUtcTimestamp } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, TextInput } from '@/components/ui/input';
import { Button, buttonClassName } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { ServerCountdown } from '@/components/events/server-countdown';
import { LockIcon } from '@/components/icons/lock-icon';
import styles from './submissions-view.module.css';

const BLOCKED_COPY: Record<SubmissionBlockedReason, string> = {
  EVENT_NOT_LIVE: 'Submissions open when the organizers launch the event.',
  SUBMISSIONS_CLOSED: 'The submission window is closed for this challenge.',
  CHALLENGE_NOT_STARTED: 'This challenge has not started yet.',
  CHALLENGE_LOCKED:
    'This challenge unlocks once your team clears the Mini-CTF, or when it opens to everyone.',
  DEADLINE_PASSED: 'The submission deadline has passed. The last submission counts.',
};

interface LinkField {
  key: 'driveUrl' | 'githubUrl' | 'presentationUrl';
  label: string;
  placeholder: string;
  hint: string;
}

function linkFields(position: number): LinkField[] {
  if (position === 1) {
    return [
      {
        key: 'driveUrl',
        label: 'Google Drive link',
        placeholder: 'https://drive.google.com/…',
        hint: 'One Drive link holding your poster, logo and teaser video.',
      },
    ];
  }

  return [
    {
      key: 'githubUrl',
      label: 'GitHub repository',
      placeholder: 'https://github.com/owner/repo',
      hint: 'The public repository the jury reviews.',
    },
    {
      key: 'presentationUrl',
      label: 'Presentation',
      placeholder: 'https://docs.google.com/presentation/…',
      hint: 'A Drive, Docs or Slides link to your pitch deck.',
    },
  ];
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 10) : '—';
}

function SubmissionDetails({ submission }: { submission: SubmissionItem }) {
  const links: { label: string; href: string }[] = [];

  if (submission.driveUrl) links.push({ label: 'Drive', href: submission.driveUrl });
  if (submission.githubUrl) links.push({ label: 'GitHub', href: submission.githubUrl });
  if (submission.reportUrl) links.push({ label: 'Report', href: submission.reportUrl });
  if (submission.presentationUrl) {
    links.push({ label: 'Presentation', href: submission.presentationUrl });
  }

  return (
    <div className={styles.receiptGrid}>
      <div className={styles.receiptItem}>
        <span className={styles.receiptLabel}>Submitted</span>
        <span className={styles.receiptValue}>{formatUtcTimestamp(submission.submittedAt)}</span>
      </div>
      {submission.githubUrl ? (
        <div className={styles.receiptItem}>
          <span className={styles.receiptLabel}>Pinned commit</span>
          <span className={styles.receiptValue}>
            {submission.commitSha ? shortSha(submission.commitSha) : 'Not available'}
          </span>
        </div>
      ) : null}
      <div className={styles.receiptItemFull}>
        <span className={styles.receiptLabel}>Links</span>
        <div className={styles.receiptGrid}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.repoLink}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function SubmissionForm({
  item,
  onSubmitted,
}: {
  item: ChallengeSubmissionState;
  onSubmitted: () => Promise<void>;
}) {
  const fields = linkFields(item.challenge.position);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canSubmit = fields.every((field) => (values[field.key] ?? '').trim().length > 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload =
      item.challenge.position === 1
        ? { challengePosition: 1 as const, driveUrl: values.driveUrl.trim() }
        : {
            challengePosition: 2 as const,
            githubUrl: values.githubUrl.trim(),
            presentationUrl: values.presentationUrl.trim(),
          };

    try {
      await api.submissions.create(payload);
      setSuccessMessage('Submission recorded. Only your latest submission is judged.');
      setValues({});
      await onSubmitted();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError
          ? err.message
          : 'The submission could not be recorded. Please retry.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {errorMessage ? (
        <Alert tone="error" title="Submission rejected">
          {errorMessage}
        </Alert>
      ) : null}
      {successMessage ? (
        <Alert tone="success" title="Submission confirmed">
          {successMessage}
        </Alert>
      ) : null}

      {fields.map((field) => (
        <FormField key={field.key} label={field.label} hint={field.hint} required>
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              type="url"
              inputMode="url"
              value={values[field.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              placeholder={field.placeholder}
              disabled={isSubmitting}
              aria-describedby={describedBy}
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}
        </FormField>
      ))}

      <div className={styles.submitRow}>
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={!canSubmit}>
          {item.current ? 'Submit a new version' : 'Submit deliverables'}
        </Button>
      </div>
    </form>
  );
}

function ChallengeCard({
  item,
  serverTime,
  onSubmitted,
}: {
  item: ChallengeSubmissionState;
  serverTime: string;
  onSubmitted: () => Promise<void>;
}) {
  const deadline = item.challenge.submissionDeadline;
  const blocked = item.blockedReason;

  return (
    <Card surface="raised" className={styles.formCard}>
      <CardHeader>
        <div className={styles.receiptHeaderRow}>
          <div>
            <CardTitle as="h2">
              Challenge {String(item.challenge.position).padStart(2, '0')} · {item.challenge.title}
            </CardTitle>
            <CardDescription>{item.challenge.summary}</CardDescription>
          </div>
          <Badge
            tone={item.canSubmit ? 'success' : item.access === 'locked' ? 'warning' : 'neutral'}
            showDot
          >
            {item.canSubmit
              ? 'Submissions open'
              : blocked === 'CHALLENGE_LOCKED'
                ? 'Locked'
                : 'Closed'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className={styles.receiptContent}>
        {deadline && item.canSubmit ? (
          <div className={styles.countdownBox}>
            <ServerCountdown
              serverTime={serverTime}
              targetTime={deadline}
              label="Deadline in"
              expiredLabel="Deadline reached"
            />
          </div>
        ) : null}

        {!item.canSubmit ? (
          <Alert tone="warning" title="Submissions closed">
            <span className={styles.lockedNotice}>
              <LockIcon size={16} /> {blocked ? BLOCKED_COPY[blocked] : 'You cannot submit now.'}
            </span>
          </Alert>
        ) : null}

        {item.access === 'locked' ? (
          <div className={styles.submitRow}>
            <Link href="/team/challenge" className={buttonClassName({ variant: 'outline' })}>
              See the challenge →
            </Link>
          </div>
        ) : null}

        {item.current ? (
          <div>
            <h3 className={styles.description}>Current submission (the one judged)</h3>
            <SubmissionDetails submission={item.current} />
          </div>
        ) : (
          <p className={styles.description}>Nothing submitted for this challenge yet.</p>
        )}

        {item.canSubmit ? <SubmissionForm item={item} onSubmitted={onSubmitted} /> : null}

        {item.history.length > 0 ? (
          <div>
            <h3 className={styles.description}>History</h3>
            <DataTable
              caption={`Submissions for challenge ${item.challenge.position}`}
              columns={[
                {
                  key: 'submittedAt',
                  header: 'Submitted (UTC)',
                  render: (submission) => formatUtcTimestamp(submission.submittedAt),
                },
                {
                  key: 'current',
                  header: 'Counts',
                  render: (submission) =>
                    submission.isCurrent ? <Badge tone="success">Judged</Badge> : '—',
                },
                {
                  key: 'drive',
                  header: 'Drive',
                  render: (submission) =>
                    submission.driveUrl ? (
                      <a
                        href={submission.driveUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.repoLink}
                      >
                        Open ↗
                      </a>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'github',
                  header: 'GitHub',
                  render: (submission) =>
                    submission.githubUrl ? (
                      <a
                        href={submission.githubUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.repoLink}
                      >
                        {shortSha(submission.commitSha)} ↗
                      </a>
                    ) : (
                      '—'
                    ),
                },
              ]}
              rows={item.history}
              getRowKey={(submission) => submission.id}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SubmissionsView() {
  const [overview, setOverview] = useState<SubmissionsOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setErrorMessage(null);

    try {
      setOverview(await api.submissions.getOverview());
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.message : 'Failed to load the submission state.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (isLoading) {
    return <LoadingState message="Loading the challenge submissions..." />;
  }

  if (errorMessage || !overview) {
    return (
      <ErrorState
        title="Submissions unavailable"
        message={errorMessage ?? 'Could not retrieve the submission state.'}
        onRetry={() => {
          setIsLoading(true);
          void loadOverview();
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>Deliverables</span>
          <h1 className={styles.title}>Challenge submissions</h1>
          <p className={styles.description}>
            Challenge 01 takes one Google Drive link with your poster, logo and teaser video.
            Challenge 02 takes your GitHub repository and your presentation. You can resubmit until
            the deadline: only the latest submission is judged.
          </p>
        </div>
      </header>

      {overview.items.length === 0 ? (
        <EmptyState
          title="No challenge yet"
          message="The organizers have not published the challenges. Watch the announcements."
        />
      ) : (
        overview.items.map((item) => (
          <ChallengeCard
            key={item.challenge.id}
            item={item}
            serverTime={overview.serverTime}
            onSubmitted={loadOverview}
          />
        ))
      )}
    </div>
  );
}
