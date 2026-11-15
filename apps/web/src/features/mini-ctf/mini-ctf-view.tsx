'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { CtfStageResponse } from 'api-contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, TextInput } from '@/components/ui/input';
import { Button, buttonClassName } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { LockIcon } from '@/components/icons/lock-icon';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './mini-ctf-view.module.css';

export function MiniCtfView() {
  const [stageData, setStageData] = useState<CtfStageResponse | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevealingHint, setIsRevealingHint] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setSubmitError(null);
    try {
      // The server owns gate availability, attempts, hints and unlock state.
      setStageData(await api.ctf.getStage());
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({ code: 'UNKNOWN', message: 'Failed to retrieve the Mini-CTF stage.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRevealHint = async () => {
    if (isRevealingHint || !stageData) return;

    setIsRevealingHint(true);
    setSubmitError(null);

    try {
      const result = await api.ctf.revealHint();
      setStageData((current) =>
        current ? { ...current, hints: [...current.hints, result.hint] } : current,
      );
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
    if (!answerInput.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const result = await api.ctf.submitAnswer({ answer: answerInput.trim() });
      setSuccessMessage(result.message);
      setAnswerInput('');
      // Re-read the authoritative state instead of assuming the unlock locally.
      setStageData(await api.ctf.getStage());
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({
          code: 'CLIENT_ERROR',
          message: 'An unexpected error occurred while validating the answer.',
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
    return <LoadingState message="Checking Mini-CTF gate status..." />;
  }

  if (!stageData) {
    return (
      <ErrorState
        title="CTF Gate Inaccessible"
        message={submitError?.message ?? 'Could not connect to the challenge gate.'}
        onRetry={() => {
          loadData();
        }}
      />
    );
  }

  const { stage, progress, hints } = stageData;
  const nextHintPosition = hints.length + 1;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>Gatekeeper Challenge · Stage {stage.position}</span>
          <h1 className={styles.title}>{stage.title}</h1>
          {stage.description && <p className={styles.description}>{stage.description}</p>}
        </div>

        <div className={styles.badgeGroup}>
          <Badge
            tone={progress.isSolved ? 'success' : progress.isOpen ? 'info' : 'warning'}
            showDot
          >
            {progress.isSolved
              ? 'Gate Cleared · Challenge Unlocked'
              : progress.isOpen
                ? 'Gate Open'
                : 'Gate Locked'}
          </Badge>
          <Badge tone="neutral">Attempts: {progress.attempts}</Badge>
          <Badge tone="neutral">
            Hints: {progress.hintsUsed}/{stage.hintCount}
          </Badge>
        </div>
      </header>

      {progress.isSolved && (
        <Card surface="raised" className={styles.solvedCard}>
          <CardHeader>
            <CardTitle as="h2">Mini-CTF Solved!</CardTitle>
            <CardDescription>
              Your answer was verified. Your main challenge track is ready for review.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.solvedContent}>
            <Alert tone="success" title="Track Workspace Unlocked">
              You have full access to your track challenge brief, dataset resources, and submission
              portal.
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

      {!progress.isOpen && !progress.isSolved && (
        <Card surface="default" className={styles.lockedCard}>
          <CardHeader>
            <div className={styles.lockedTitle}>
              <LockIcon size={22} />
              <CardTitle as="h2">The Mini-CTF is locked</CardTitle>
            </div>
            <CardDescription>
              Unlock condition: your team must be checked in and the event must enter the live
              phase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert tone="info" title="Awaiting Event Launch">
              Please ensure your entire team has checked in with entrance staff. Once the event goes
              live, you can open the stage material here.
            </Alert>
          </CardContent>
        </Card>
      )}

      {progress.isOpen && !progress.isSolved && (
        <>
          <Card surface="raised" className={styles.formCard}>
            <CardHeader>
              <CardTitle as="h2">Stage Material</CardTitle>
              <CardDescription>
                Inspect the photograph, then open the archive with the password you derive from it.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.materialContent}>
              {stage.assetImageUrl && (
                <Image
                  src={stage.assetImageUrl}
                  alt="Louage photograph supplied for this stage"
                  width={1200}
                  height={900}
                  className={styles.assetImage}
                  priority
                />
              )}
              {stage.assetZipUrl && (
                <div className={styles.assetActions}>
                  <a
                    href={stage.assetZipUrl}
                    download
                    className={buttonClassName({ variant: 'secondary', size: 'md' })}
                  >
                    Download CTF.zip
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card surface="default" className={styles.formCard}>
            <CardHeader>
              <CardTitle as="h2">Hints</CardTitle>
              <CardDescription>
                Hints are revealed one at a time and are recorded against your team.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.hintContent}>
              {hints.length === 0 && <p className={styles.description}>No hints revealed yet.</p>}
              <ol className={styles.hintList}>
                {hints.map((hint) => (
                  <li key={hint.position} className={styles.hintItem}>
                    <span className={styles.hintPosition}>Hint {hint.position}</span>
                    <span>{hint.body}</span>
                  </li>
                ))}
              </ol>
              {hints.length < stage.hintCount && (
                <div className={styles.submitRow}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    loading={isRevealingHint}
                    onClick={handleRevealHint}
                  >
                    Reveal hint {nextHintPosition} of {stage.hintCount}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card surface="raised" className={styles.formCard}>
            <CardHeader>
              <CardTitle as="h2">Submit the Registration</CardTitle>
              <CardDescription>
                Enter the registration written inside the archive to unlock your main challenge.
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
                        ? 'Too Many Attempts'
                        : submitError.code === 'CTF_NOT_SOLVED'
                          ? 'Incorrect Answer'
                          : 'Validation Error'
                    }
                  >
                    {submitError.message}
                  </Alert>
                </div>
              )}

              {successMessage && (
                <Alert tone="success" title="Success!">
                  {successMessage}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className={styles.form}>
                <FormField
                  label="Registration"
                  hint="Spacing, dashes and letter case are ignored."
                  required
                >
                  {({ id, describedBy }) => (
                    <TextInput
                      id={id}
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      placeholder="000 TUN 0000"
                      disabled={isSubmitting}
                      aria-describedby={describedBy}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  )}
                </FormField>

                <div className={styles.submitRow}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!answerInput.trim()}
                  >
                    {isSubmitting ? 'Validating…' : 'Submit Answer'}
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
