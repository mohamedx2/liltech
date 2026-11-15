'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { CtfChainResponse, CtfTrackItem } from 'api-contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, TextInput } from '@/components/ui/input';
import { Button, buttonClassName } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { LockIcon } from '@/components/icons/lock-icon';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './mini-ctf-view.module.css';

const STATE_LABEL: Record<CtfTrackItem['state'], string> = {
  solved: 'Solved',
  unlocked: 'Current',
  locked: 'Locked',
};

const STATE_CLASS: Record<CtfTrackItem['state'], string> = {
  solved: 'trackerItemSolved',
  unlocked: 'trackerItemCurrent',
  locked: 'trackerItemLocked',
};

function StageTracker({ stages }: { stages: CtfTrackItem[] }) {
  return (
    <ol className={styles.tracker} aria-label="Mini-CTF stages">
      {stages.map((stage) => (
        <li
          key={stage.slug}
          className={`${styles.trackerItem} ${styles[STATE_CLASS[stage.state]] ?? ''}`}
          aria-current={stage.state === 'unlocked' ? 'step' : undefined}
        >
          <span className={styles.trackerIndex}>{String(stage.position).padStart(2, '0')}</span>
          <span className={styles.trackerTitle}>{stage.title}</span>
          <span className={styles.trackerState}>
            {stage.state === 'locked' ? (
              <>
                <LockIcon size={12} /> {STATE_LABEL[stage.state]}
              </>
            ) : (
              STATE_LABEL[stage.state]
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MiniCtfView() {
  const [chain, setChain] = useState<CtfChainResponse | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevealingHint, setIsRevealingHint] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setSubmitError(null);
    try {
      // The server owns which stage is current; the client renders it.
      setChain(await api.ctf.getChain());
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({ code: 'UNKNOWN', message: 'Failed to load the Mini-CTF.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const current = chain?.current ?? null;
  const currentSlug = current?.stage.slug;

  const handleRevealHint = async () => {
    if (!currentSlug || isRevealingHint) return;

    setIsRevealingHint(true);
    setSubmitError(null);

    try {
      await api.ctf.revealHint(currentSlug);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({ code: 'UNKNOWN', message: 'Could not reveal the next hint.' });
      }
    } finally {
      setIsRevealingHint(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSlug || !answerInput.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const result = await api.ctf.submitAnswer(currentSlug, { answer: answerInput.trim() });
      setSuccessMessage(result.message);
      setAnswerInput('');
      // Always trust the server's refreshed state, never the local response.
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({
          code: 'CLIENT_ERROR',
          message: 'An unexpected error occurred while validating the flag.',
        });
      }
      setTimeout(() => {
        errorSummaryRef.current?.focus();
      }, 50);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading the LOUAGE 404 investigation..." />;
  }

  if (!chain) {
    return (
      <ErrorState
        title="Mini-CTF unavailable"
        message={submitError?.message ?? 'Could not reach the investigation server.'}
        onRetry={() => {
          setIsLoading(true);
          void loadData();
        }}
      />
    );
  }

  const chainComplete = chain.current === null && chain.summary.solved === chain.summary.total;
  const stageUnavailable = current !== null && current.stage.status !== 'live';
  const driveUrl = current?.stage.assetDriveUrl ?? null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>LOUAGE 404 · The Missing Passenger</span>
          <h1 className={styles.title}>Mini-CTF Investigation</h1>
          <p className={styles.description}>
            Seven stages stand between your team and the main challenge. Each solved flag unlocks
            the next piece of the investigation.
          </p>
        </div>

        <div className={styles.badgeGroup}>
          <Badge tone={chainComplete ? 'success' : chain.eligible ? 'info' : 'warning'} showDot>
            {chainComplete
              ? 'Investigation complete'
              : chain.eligible
                ? 'In progress'
                : 'Not checked in'}
          </Badge>
          <Badge tone="neutral">
            {chain.summary.solved}/{chain.summary.total} solved
          </Badge>
          <Badge tone="neutral">{chain.team.name}</Badge>
        </div>
      </header>

      <StageTracker stages={chain.stages} />

      {chainComplete && (
        <Card surface="raised" className={styles.solvedCard}>
          <CardHeader>
            <CardTitle as="h2">Investigation completed</CardTitle>
            <CardDescription>You were the missing passenger all along.</CardDescription>
          </CardHeader>
          <CardContent className={styles.solvedContent}>
            <Alert tone="success" title="Main challenge unlocked">
              Every required stage has been solved. The investigation is over — your main challenge
              is now available.
            </Alert>
            <div className={styles.actionRow}>
              <Link
                href="/team/challenge"
                className={buttonClassName({ variant: 'primary', size: 'lg' })}
              >
                Go to Main Challenge →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {!chain.eligible && (
        <Card surface="default" className={styles.lockedCard}>
          <CardHeader>
            <div className={styles.lockedTitle}>
              <LockIcon size={22} />
              <CardTitle as="h2">The Mini-CTF is locked</CardTitle>
            </div>
            <CardDescription>
              Your team must be checked in at the entrance before the investigation opens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert tone="info" title="Awaiting check-in">
              Ask an organizer to scan your entrance badges. The stages unlock as soon as your team
              is checked in.
            </Alert>
          </CardContent>
        </Card>
      )}

      {chain.eligible && current && (
        <>
          <Card surface="raised" className={styles.formCard}>
            <CardHeader>
              <div className={styles.stageHeading}>
                <span className={styles.stageNumber}>
                  Stage {String(current.stage.position).padStart(2, '0')} /{' '}
                  {String(current.stage.totalStages).padStart(2, '0')}
                </span>
                <CardTitle as="h2">{current.stage.title}</CardTitle>
              </div>
              <CardDescription>
                {current.stage.description ?? 'No briefing published for this stage yet.'}
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.stageContent}>
              <div className={styles.stageMeta}>
                <Badge tone="neutral">Attempts: {current.progress.attempts}</Badge>
                <Badge tone="neutral">
                  Hints: {current.progress.hintsUsed}/{current.stage.hintCount}
                </Badge>
                <Badge tone={stageUnavailable ? 'warning' : 'info'}>
                  {stageUnavailable ? 'Not published yet' : 'Open'}
                </Badge>
              </div>

              <section className={styles.resources} aria-label="Challenge resources">
                <h2 className={styles.resourcesTitle}>Challenge resources</h2>
                {driveUrl ? (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={buttonClassName({ variant: 'secondary', size: 'md' })}
                  >
                    Open Google Drive
                    <span aria-hidden="true"> ↗</span>
                  </a>
                ) : (
                  <p className={styles.resourceNote}>
                    {stageUnavailable
                      ? 'Resources are not available yet. Keep an eye on the announcements.'
                      : 'Resources for this stage have not been published yet.'}
                  </p>
                )}
                <p className={styles.resourceNote}>
                  Resources are hosted outside the platform. If your system cannot open the archive,
                  use 7-Zip (Windows) or Keka (macOS).
                </p>
              </section>
            </CardContent>
          </Card>

          <Card surface="default" className={styles.formCard}>
            <CardHeader>
              <CardTitle as="h2">Hints</CardTitle>
              <CardDescription>
                Hints are revealed one at a time and recorded for your team.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.hintContent}>
              {current.hints.length === 0 ? (
                <p className={styles.description}>No hints revealed yet.</p>
              ) : (
                <ol className={styles.hintList}>
                  {current.hints.map((hint) => (
                    <li key={hint.position} className={styles.hintItem}>
                      <span className={styles.hintPosition}>Hint {hint.position}</span>
                      <span>{hint.body}</span>
                    </li>
                  ))}
                </ol>
              )}

              {current.hints.length < current.stage.hintCount && !current.progress.solved && (
                <div className={styles.submitRow}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    loading={isRevealingHint}
                    disabled={stageUnavailable}
                    onClick={handleRevealHint}
                  >
                    Reveal hint {current.hints.length + 1} of {current.stage.hintCount}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card surface="raised" className={styles.formCard}>
            <CardHeader>
              <CardTitle as="h2">Submit your flag</CardTitle>
              <CardDescription>
                The server verifies your flag. A correct flag unlocks the next stage immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitError && (
                <div
                  ref={errorSummaryRef}
                  tabIndex={-1}
                  className={styles.errorSummaryWrapper}
                  aria-live="assertive"
                >
                  <Alert
                    tone="error"
                    title={
                      submitError.code === 'RATE_LIMITED'
                        ? 'Too many attempts'
                        : submitError.code === 'CTF_NOT_SOLVED'
                          ? 'Incorrect flag'
                          : submitError.code === 'STAGE_LOCKED'
                            ? 'Stage locked'
                            : submitError.code === 'STAGE_NOT_PUBLISHED'
                              ? 'Stage unavailable'
                              : 'Validation error'
                    }
                  >
                    {submitError.message}
                  </Alert>
                </div>
              )}

              {successMessage && (
                <Alert tone="success" title="Correct flag">
                  {successMessage}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className={styles.form}>
                <FormField
                  label="Flag"
                  hint="Format L404{...}. Spacing, dashes and letter case are ignored."
                  required
                >
                  {({ id, describedBy }) => (
                    <TextInput
                      id={id}
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      placeholder="Enter your flag..."
                      disabled={isSubmitting || stageUnavailable || current.progress.solved}
                      aria-describedby={describedBy}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                  )}
                </FormField>

                <div className={styles.submitRow}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!answerInput.trim() || stageUnavailable || current.progress.solved}
                  >
                    Submit flag
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
