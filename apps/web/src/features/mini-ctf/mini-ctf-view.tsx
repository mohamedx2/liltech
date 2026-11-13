'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { MiniCtfStatusResponse } from '@/lib/api/contracts/pending';
import { parseIsoTimestamp } from 'shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, TextInput } from '@/components/ui/input';
import { Button, buttonClassName } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { LockIcon } from '@/components/icons/lock-icon';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './mini-ctf-view.module.css';

export function MiniCtfView() {
  const [ctfStatus, setCtfStatus] = useState<MiniCtfStatusResponse | null>(null);
  /** Milliseconds between server time and client time, captured at the last fetch. */
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [flagInput, setFlagInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  /** Server-provided cooldown end timestamp (ISO), or null when not cooling down. */
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const syncCooldown = useCallback((status: MiniCtfStatusResponse, offsetMs: number) => {
    setCooldownUntil(status.cooldownUntil ?? null);
    const untilMs = parseIsoTimestamp(status.cooldownUntil ?? '')?.getTime() ?? null;
    if (untilMs === null) {
      setCooldownRemaining(0);
      return;
    }
    setCooldownRemaining(Math.max(0, Math.ceil((untilMs - (Date.now() + offsetMs)) / 1000)));
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setSubmitError(null);
    try {
      // The event state supplies the authoritative server clock used to
      // anchor the cooldown countdown (AGENTS.md §2: server owns event time).
      const [statusData, eventData] = await Promise.all([
        api.miniCtf.getStatus(),
        api.events.getEventState(),
      ]);
      const offsetMs =
        (parseIsoTimestamp(eventData.serverTime)?.getTime() ?? Date.now()) - Date.now();
      setServerOffsetMs(offsetMs);
      setCtfStatus(statusData);
      syncCooldown(statusData, offsetMs);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({ code: 'UNKNOWN', message: 'Failed to retrieve Mini-CTF gate status.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [syncCooldown]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recompute the remaining cooldown each second from the server-anchored
  // end timestamp instead of blindly decrementing a client-side counter.
  useEffect(() => {
    if (!cooldownUntil) return;
    const untilMs = parseIsoTimestamp(cooldownUntil)?.getTime();
    if (untilMs === undefined) return;

    const update = () => {
      setCooldownRemaining(
        Math.max(0, Math.ceil((untilMs - (Date.now() + serverOffsetMs)) / 1000)),
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil, serverOffsetMs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagInput.trim() || isSubmitting || cooldownRemaining > 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const result = await api.miniCtf.submitFlag({ flag: flagInput.trim() });
      setSuccessMessage(result.message);
      setFlagInput('');
      // Reload status to reflect solved state
      const updatedStatus = await api.miniCtf.getStatus();
      setCtfStatus(updatedStatus);
      setCooldownUntil(null);
      setCooldownRemaining(0);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({ code: err.code, message: err.message });
        if (err.code === 'RATE_LIMITED') {
          // The server owns the cooldown window — re-read its status instead
          // of hardcoding a duration on the client.
          try {
            const updatedStatus = await api.miniCtf.getStatus();
            setCtfStatus(updatedStatus);
            syncCooldown(updatedStatus, serverOffsetMs);
          } catch {
            setCooldownUntil(null);
            setCooldownRemaining(0);
          }
        }
      } else {
        setSubmitError({
          code: 'CLIENT_ERROR',
          message: 'An unexpected error occurred while validating the flag.',
        });
      }
      // Focus error summary for accessibility
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

  if (!ctfStatus) {
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

  // The server decides whether the gate is open; the frontend only renders it.
  const isSolved = ctfStatus.isSolved;
  const isGateOpen = ctfStatus.isOpen;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>Gatekeeper Challenge</span>
          <h1 className={styles.title}>Mini-CTF Track Gate</h1>
          <p className={styles.description}>
            Solve the gatekeeper challenge to unlock your team&apos;s main track problem statement
            and deliverables workspace.
          </p>
        </div>

        <div className={styles.badgeGroup}>
          <Badge tone={isSolved ? 'success' : isGateOpen ? 'info' : 'warning'} showDot>
            {isSolved
              ? 'Gate Cleared · Challenge Unlocked'
              : isGateOpen
                ? 'Gate Open'
                : 'Gate Locked'}
          </Badge>
          <Badge tone="neutral">Attempts: {ctfStatus.attemptsCount}</Badge>
        </div>
      </header>

      {/* Already Solved State */}
      {isSolved && (
        <Card surface="raised" className={styles.solvedCard}>
          <CardHeader>
            <CardTitle as="h2">Mini-CTF Solved!</CardTitle>
            <CardDescription>
              Your flag submission was verified. Your main challenge track is ready for review.
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

      {/* Gate Closed State */}
      {!isGateOpen && !isSolved && (
        <Card surface="default" className={styles.lockedCard}>
          <CardHeader>
            <div className={styles.lockedTitle}>
              <LockIcon size={22} />
              <CardTitle as="h2">The Mini-CTF is locked</CardTitle>
            </div>
            <CardDescription>
              Unlock condition: your team must be checked in and the event must enter the live phase
              at 20:00 UTC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert tone="info" title="Awaiting Event Launch">
              Please ensure your entire team has checked in with entrance staff. Once the event goes
              live, you can enter your flag here.
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Active Submission Form */}
      {isGateOpen && !isSolved && (
        <Card surface="raised" className={styles.formCard}>
          <CardHeader>
            <CardTitle as="h2">Submit Challenge Flag</CardTitle>
            <CardDescription>
              Input the flag discovered during the Mini-CTF investigation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ctfStatus.hint && (
              <Alert tone="info" title="Challenge Hint">
                {ctfStatus.hint}
              </Alert>
            )}

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
                      ? 'Rate Limit Engaged'
                      : submitError.code === 'CTF_NOT_SOLVED'
                        ? 'Incorrect Flag'
                        : 'Validation Error'
                  }
                >
                  {submitError.message}
                  {cooldownRemaining > 0 && (
                    <div className={styles.cooldownNotice}>
                      Retry available in: <strong>{cooldownRemaining}s</strong>
                    </div>
                  )}
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
                label="Mini-CTF Flag"
                hint="Flag format is typically LILTECH{...}"
                required
              >
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    value={flagInput}
                    onChange={(e) => setFlagInput(e.target.value)}
                    placeholder="LILTECH{...}"
                    disabled={isSubmitting || cooldownRemaining > 0}
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
                  disabled={!flagInput.trim() || cooldownRemaining > 0}
                >
                  {cooldownRemaining > 0
                    ? `Cooldown Active (${cooldownRemaining}s)`
                    : isSubmitting
                      ? 'Validating Flag...'
                      : 'Submit Flag'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
