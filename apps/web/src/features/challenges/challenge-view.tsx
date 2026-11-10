'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { ChallengeDetailResponse } from '@/lib/api/contracts/pending';
import { getTrackLabel } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './challenge-view.module.css';

export function ChallengeView() {
  const [challenge, setChallenge] = useState<ChallengeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLockedByCtf, setIsLockedByCtf] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsLockedByCtf(false);

    try {
      const data = await api.challenges.getCurrentChallenge();
      setChallenge(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CTF_NOT_SOLVED') {
          setIsLockedByCtf(true);
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage('Failed to load challenge workspace.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  if (isLoading) {
    return <LoadingState message="Decrypting and loading your track challenge brief..." />;
  }

  if (isLockedByCtf) {
    return (
      <div className={styles.lockedContainer}>
        <Card surface="default" className={styles.lockedCard}>
          <CardHeader>
            <div className={styles.lockedBadgeRow}>
              <Badge tone="warning" showDot>
                Challenge Locked
              </Badge>
            </div>
            <CardTitle as="h1">Mini-CTF Clearance Required</CardTitle>
            <CardDescription>
              Your challenge brief and dataset resources remain encrypted until your team submits a
              valid flag.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.lockedContent}>
            <Alert tone="warning" title="Solve the Mini-CTF First">
              Head to the Mini-CTF gate to investigate the challenge and submit the required flag.
            </Alert>
            <div className={styles.actionRow}>
              <Link
                href="/team/ctf"
                className={buttonClassName({ variant: 'primary', size: 'lg' })}
              >
                Go to Mini-CTF Gate →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (errorMessage || !challenge) {
    return (
      <ErrorState
        title="Challenge Unavailable"
        message={errorMessage ?? 'Could not retrieve challenge brief.'}
        onRetry={() => {
          loadChallenge();
        }}
      />
    );
  }

  const trackLabel = getTrackLabel(challenge.track);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <div className={styles.trackBadgeRow}>
            <Badge tone="info" showDot>
              Assigned Track: {trackLabel}
            </Badge>
            <Badge tone="success">Challenge Active</Badge>
          </div>
          <h1 className={styles.title}>{challenge.title}</h1>
          <p className={styles.overview}>{challenge.description}</p>
        </div>

        <div className={styles.topAction}>
          <Link href="/team/submissions" className={buttonClassName({ variant: 'primary' })}>
            Submit Deliverables
          </Link>
        </div>
      </header>

      {/* Problem Statement Card */}
      <Card surface="default" className={styles.card}>
        <CardHeader>
          <CardTitle as="h2">Problem Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={styles.problemText}>{challenge.problemStatement}</p>
        </CardContent>
      </Card>

      {/* Deliverable Specifications */}
      <Card surface="raised" className={styles.card}>
        <CardHeader>
          <CardTitle as="h2">Deliverable Requirements</CardTitle>
          <CardDescription>
            Ensure your submission satisfies all required specifications prior to the 08:00 UTC
            deadline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={styles.requirementsList}>
            {challenge.deliverablesRequirements.map((req, idx) => (
              <li key={idx} className={styles.requirementItem}>
                <span className={styles.reqCheck} aria-hidden="true">
                  ✓
                </span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Resource & Attachment Downloads */}
      <Card surface="default" className={styles.card}>
        <CardHeader>
          <CardTitle as="h2">Resource Downloads &amp; Tooling</CardTitle>
          <CardDescription>
            Official datasets, protocol documentation, and evaluation scripts provided for this
            track.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={styles.resourcesGrid}>
            {challenge.resources.map((res, idx) => (
              <div key={idx} className={styles.resourceCard}>
                <div className={styles.resourceInfo}>
                  <span className={styles.resourceIcon} aria-hidden="true">
                    📦
                  </span>
                  <div>
                    <h3 className={styles.resourceName}>{res.name}</h3>
                    {res.size && <span className={styles.resourceSize}>{res.size}</span>}
                  </div>
                </div>
                <a
                  href={res.url}
                  download={res.name}
                  className={buttonClassName({ variant: 'outline', size: 'sm' })}
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
