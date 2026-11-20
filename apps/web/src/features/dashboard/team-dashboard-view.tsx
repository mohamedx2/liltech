'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TeamProgressState } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import type {
  EventStateResponse,
  TeamBadgesResponse,
  TeamSummary,
} from '@/lib/api/contracts/pending';
import { Stepper } from './stepper';
import { QrPassCard } from './qr-pass-card';
import { TeamRoster } from './team-roster';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { ServerCountdown } from '@/components/events/server-countdown';
import { LockIcon } from '@/components/icons/lock-icon';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import styles from './team-dashboard-view.module.css';

export function TeamDashboardView() {
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [badge, setBadge] = useState<TeamBadgesResponse | null>(null);
  const [eventState, setEventState] = useState<EventStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [teamData, badgeData, eventData] = await Promise.all([
        api.participants.getMyTeam(),
        api.participants.getMyBadges(),
        api.events.getEventState(),
      ]);
      setTeam(teamData);
      setBadge(badgeData);
      setEventState(eventData);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load team dashboard data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return <LoadingState message="Loading your team competition profile..." />;
  }

  if (errorMessage || !team || !badge || !eventState) {
    return (
      <ErrorState
        title="Dashboard Unavailable"
        message={errorMessage ?? 'Could not retrieve team competition data.'}
        onRetry={() => {
          loadData();
        }}
      />
    );
  }

  const progressOrder = [
    TeamProgressState.Registered,
    TeamProgressState.CheckedIn,
    TeamProgressState.CtfUnlocked,
    TeamProgressState.CtfSolved,
    TeamProgressState.ChallengeUnlocked,
    TeamProgressState.Submitted,
  ] as const;
  const progressIndex = progressOrder.indexOf(team.progress);
  const canEnterCtf = progressIndex >= progressOrder.indexOf(TeamProgressState.CtfUnlocked);
  const canOpenChallenge = progressIndex >= progressOrder.indexOf(TeamProgressState.CtfSolved);
  const canSubmit = progressIndex >= progressOrder.indexOf(TeamProgressState.ChallengeUnlocked);

  return (
    <div className={styles.container}>
      {/* Overview & Live Countdown Bar */}
      <section className={styles.heroSection} aria-labelledby="dashboard-overview-heading">
        <div className={styles.teamHeroDetails}>
          <span className={styles.subHeading}>Team Competition Portal</span>
          <h1 id="dashboard-overview-heading" className={styles.teamName}>
            {team.name}
          </h1>

          <div className={styles.badgeRow}>
            <Badge tone="info" showDot>
              Phase: {eventState.phaseLabel ?? eventState.phase.replace('_', ' ')}
            </Badge>

            <Badge tone={team.isCheckedIn ? 'success' : 'warning'}>
              {team.isCheckedIn ? 'Checked In' : 'Pending Entrance Check-In'}
            </Badge>
          </div>
        </div>

        {eventState.nextPhaseAt && (
          <div className={styles.countdownWrapper}>
            <ServerCountdown
              serverTime={eventState.serverTime}
              targetTime={eventState.nextPhaseAt}
              label="Next Milestone Deadline"
            />
          </div>
        )}
      </section>

      {/* Progress Stepper */}
      <Card surface="default" className={styles.stepperCard}>
        <CardHeader>
          <CardTitle as="h2">Competition Progress</CardTitle>
          <CardDescription>
            Current team progression state: <strong>{team.progress.replace('_', ' ')}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stepper currentProgress={team.progress} ctfSolved={team.ctfSolved} />
        </CardContent>
      </Card>

      {/* Action Quick-Cards */}
      <div className={styles.quickActionsGrid}>
        <Card surface="raised" className={styles.actionCard}>
          <CardHeader>
            <CardTitle as="h3">Mini-CTF Gate</CardTitle>
            <CardDescription>
              Submit your challenge flag to unlock your track workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.actionCardContent}>
            {canEnterCtf ? (
              <Link
                href="/team/ctf"
                className={buttonClassName({
                  variant: canOpenChallenge ? 'outline' : 'primary',
                  size: 'lg',
                })}
              >
                Enter CTF Gate
              </Link>
            ) : (
              <p className={styles.lockedAction}>
                <LockIcon />
                Unlocks after team check-in and the 20:00 event launch.
              </p>
            )}
          </CardContent>
        </Card>

        <Card surface="raised" className={styles.actionCard}>
          <CardHeader>
            <CardTitle as="h3">Main Challenge</CardTitle>
            <CardDescription>
              Review challenge brief, problem statement, and downloadable resources.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.actionCardContent}>
            {canOpenChallenge ? (
              <Link
                href="/team/challenge"
                className={buttonClassName({
                  variant: canSubmit ? 'secondary' : 'primary',
                  size: 'lg',
                })}
              >
                View Challenge
              </Link>
            ) : (
              <p className={styles.lockedAction}>
                <LockIcon />
                Unlocks when the server validates your Mini-CTF flag.
              </p>
            )}
          </CardContent>
        </Card>

        <Card surface="raised" className={styles.actionCard}>
          <CardHeader>
            <CardTitle as="h3">Deliverables</CardTitle>
            <CardDescription>
              Submit your project repository and archives before 08:00 UTC.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.actionCardContent}>
            {canSubmit ? (
              <Link
                href="/team/submissions"
                className={buttonClassName({ variant: 'primary', size: 'lg' })}
              >
                Manage Submissions
              </Link>
            ) : (
              <p className={styles.lockedAction}>
                <LockIcon />
                Unlocks with your main challenge workspace.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dual Panel: Personal QR Pass & Team Roster */}
      <div className={styles.bottomGrid}>
        <QrPassCard badges={badge} />
        <TeamRoster members={team.members} />
      </div>
    </div>
  );
}
