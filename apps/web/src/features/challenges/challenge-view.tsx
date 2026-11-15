'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { CurrentChallengeResponse } from 'api-contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { LockIcon } from '@/components/icons/lock-icon';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './challenge-view.module.css';

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

function NoticeCard({
  badge,
  title,
  description,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.lockedContainer}>
      <Card surface="default" className={styles.lockedCard}>
        <CardHeader>
          <div className={styles.lockedBadgeRow}>
            <Badge tone="warning" showDot>
              {badge}
            </Badge>
          </div>
          <div className={styles.lockedTitle}>
            <LockIcon size={24} />
            <CardTitle as="h1">{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent className={styles.lockedContent}>{children}</CardContent> : null}
      </Card>
    </div>
  );
}

export function ChallengeView() {
  const [response, setResponse] = useState<CurrentChallengeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setResponse(await api.challenges.getCurrentChallenge());
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.message : 'Failed to load the challenge.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  if (isLoading) {
    return <LoadingState message="Loading the challenge..." />;
  }

  if (errorMessage || !response) {
    return (
      <ErrorState
        title="Challenge Unavailable"
        message={errorMessage ?? 'Could not retrieve the challenge.'}
        onRetry={() => {
          loadChallenge();
        }}
      />
    );
  }

  if (!response.available) {
    return (
      <NoticeCard
        badge={response.reason === 'EVENT_NOT_STARTED' ? 'Not Started' : 'Waiting'}
        title={
          response.reason === 'EVENT_NOT_STARTED'
            ? "The hackathon hasn't started yet"
            : 'No challenge has started yet'
        }
        description={response.message}
      />
    );
  }

  const { challenge: schedule, access, content } = response.current;

  if (access === 'locked' || !content) {
    const opensAt = schedule.status === 'live' ? formatTime(schedule.publicAt) : '';
    return (
      <NoticeCard
        badge="Challenge Locked"
        title={schedule.title}
        description={
          opensAt
            ? `The description opens for every team at ${opensAt}. Solve this challenge's Mini-CTF to read it now.`
            : 'This challenge has not started yet.'
        }
      >
        {schedule.summary ? <p className={styles.overview}>{schedule.summary}</p> : null}
        {opensAt ? (
          <div className={styles.actionRow}>
            <Link href="/team/ctf" className={buttonClassName({ variant: 'primary', size: 'lg' })}>
              Go to Mini-CTF Gate →
            </Link>
          </div>
        ) : null}
      </NoticeCard>
    );
  }

  const challenge = {
    title: schedule.title,
    description: content.description,
    problemStatement: content.problemStatement,
    deliverablesRequirements: content.deliverables,
    resources: content.resources,
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <div className={styles.trackBadgeRow}>
            <Badge tone="info" showDot>
              Challenge {schedule.position}
            </Badge>
            <Badge tone={schedule.status === 'live' ? 'success' : 'neutral'}>
              {schedule.status === 'live' ? 'Challenge Active' : 'Challenge Ended'}
            </Badge>
            {access === 'early' ? (
              <Badge tone="warning">Early access (Mini-CTF solved)</Badge>
            ) : null}
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
            Make sure your submission covers every requirement below.
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
                  <svg
                    className={styles.resourceIcon}
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                    <path d="M5 19h14" />
                  </svg>
                  <div>
                    <h3 className={styles.resourceName}>{res.name}</h3>
                  </div>
                </div>
                <a
                  href={res.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={buttonClassName({ variant: 'outline', size: 'sm' })}
                >
                  Open
                </a>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
