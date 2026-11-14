'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EventPhase, type AuditLogEntry, type HealthResponse } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import type { EventStateResponse } from '@/lib/api/contracts/pending';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import styles from './admin-dashboard-view.module.css';

const ORDERED_PHASES: readonly EventPhase[] = [
  EventPhase.Registration,
  EventPhase.Checkin,
  EventPhase.Live,
  EventPhase.SubmissionsClosed,
  EventPhase.Pitching,
  EventPhase.Results,
];

export function AdminDashboardView() {
  const [eventState, setEventState] = useState<EventStateResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [transitioningPhase, setTransitioningPhase] = useState(false);
  const [phaseSuccessMessage, setPhaseSuccessMessage] = useState<string | null>(null);
  const [phaseErrorMessage, setPhaseErrorMessage] = useState<string | null>(null);

  const [announcementText, setAnnouncementText] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [stateData, healthData, auditData] = await Promise.all([
        api.events.getEventState(),
        api.getHealth(),
        api.admin.getAuditLog({ limit: 10 }),
      ]);
      setEventState(stateData);
      setHealth(healthData);
      setAuditLog(auditData.items);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load administrative control panel data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePhaseTransition = async (targetPhase: EventPhase) => {
    if (targetPhase === eventState?.phase) return;

    const confirmed = window.confirm(
      `CRITICAL OVERRIDE: Are you sure you want to transition the event phase to '${targetPhase.toUpperCase()}'?\n\nThis action affects team unlock permissions and submission deadlines, and is permanently recorded in the audit log.`,
    );

    if (!confirmed) return;

    setTransitioningPhase(true);
    setPhaseSuccessMessage(null);
    setPhaseErrorMessage(null);

    try {
      const updated = await api.events.updatePhase(targetPhase);
      setEventState(updated);
      setPhaseSuccessMessage(
        `Event phase transitioned to ${targetPhase.toUpperCase()} successfully.`,
      );
      // Refresh audit log
      const auditData = await api.admin.getAuditLog({ limit: 10 });
      setAuditLog(auditData.items);
    } catch (err) {
      setPhaseErrorMessage(
        err instanceof ApiClientError ? err.message : 'Could not transition event phase.',
      );
    } finally {
      setTransitioningPhase(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim() || isBroadcasting) return;

    setIsBroadcasting(true);
    setBroadcastSuccess(null);
    try {
      await api.admin.publishAnnouncement(announcementText.trim());
      setBroadcastSuccess('Announcement published and broadcast to all participants!');
      setAnnouncementText('');
      // Refresh audit log
      const auditData = await api.admin.getAuditLog({ limit: 10 });
      setAuditLog(auditData.items);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Failed to publish announcement.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (isLoading && !eventState) {
    return <LoadingState message="Loading administrative controls and system telemetry..." />;
  }

  if (errorMessage && !eventState) {
    return (
      <ErrorState
        title="Admin Control Panel Unavailable"
        message={errorMessage}
        onRetry={loadData}
      />
    );
  }

  const currentPhaseIndex = eventState ? ORDERED_PHASES.indexOf(eventState.phase) : 0;
  const nextPhase =
    currentPhaseIndex < ORDERED_PHASES.length - 1 ? ORDERED_PHASES[currentPhaseIndex + 1] : null;

  return (
    <div className={styles.container}>
      {/* Hero Header */}
      <section className={styles.hero} aria-labelledby="admin-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Platform Operations</span>
          {health ? (
            <Badge tone={health.status === 'ok' ? 'success' : 'danger'} showDot>
              API & DB: {health.status.toUpperCase()} ({health.uptimeSeconds}s uptime)
            </Badge>
          ) : null}
        </div>
        <h1 id="admin-title" className={styles.title}>
          Admin Control Panel
        </h1>
        <p className={styles.description}>
          Authoritative event phase management, operational monitoring, broadcast announcements, and
          tamper-evident administrative audit log.
        </p>
      </section>

      {/* Phase Transition Controls */}
      <section className={styles.phaseControlCard} aria-labelledby="phase-controls-heading">
        <div className={styles.phaseControlHeader}>
          <h2 id="phase-controls-heading" className={styles.sectionTitle}>
            Authoritative Event Phase Stepper
          </h2>
          <Badge tone="info">Source of Truth: Backend Service</Badge>
        </div>

        {eventState ? (
          <div className={styles.currentPhaseBanner}>
            <div className={styles.currentPhaseInfo}>
              <span className={styles.phaseLabel}>Current Platform Phase</span>
              <span className={styles.phaseValue}>{eventState.phase.replace('_', ' ')}</span>
            </div>

            {nextPhase ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => handlePhaseTransition(nextPhase)}
                loading={transitioningPhase}
                loadingLabel="Transitioning…"
              >
                Advance to {nextPhase.replace('_', ' ')} →
              </Button>
            ) : (
              <Badge tone="success">Event Complete</Badge>
            )}
          </div>
        ) : null}

        {phaseSuccessMessage ? (
          <Alert tone="success" title="Phase Updated">
            {phaseSuccessMessage}
          </Alert>
        ) : null}

        {phaseErrorMessage ? (
          <Alert tone="error" title="Phase Transition Error">
            {phaseErrorMessage}
          </Alert>
        ) : null}

        {/* Phase Overrides Bar */}
        <div className={styles.phasesStepper} role="group" aria-label="Event phase override steps">
          {ORDERED_PHASES.map((p, idx) => {
            const isActive = eventState?.phase === p;
            return (
              <button
                key={p}
                type="button"
                data-active={isActive}
                onClick={() => handlePhaseTransition(p)}
                disabled={transitioningPhase}
                className={styles.phaseStepBtn}
                aria-label={`Jump to phase ${idx + 1}: ${p}`}
              >
                <span>Phase {idx + 1}</span>
                <span>{p.replace('_', ' ')}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Operations Quick Action Cards */}
      <section className={styles.quickActionsGrid} aria-label="Operations and sub-portals">
        <Link href="/checkin" className={styles.actionCard}>
          <span className={styles.actionIcon} aria-hidden="true">
            📷
          </span>
          <h3 className={styles.actionTitle}>QR Entrance Scanner</h3>
          <p className={styles.actionDescription}>
            Scan attendee badges, verify credentials, and manage entrance attendance in real-time.
          </p>
        </Link>

        <Link href="/jury" className={styles.actionCard}>
          <span className={styles.actionIcon} aria-hidden="true">
            ⚖️
          </span>
          <h3 className={styles.actionTitle}>Jury Scoring & Evaluation</h3>
          <p className={styles.actionDescription}>
            Inspect track-scoped jury evaluations, rubric scoring breakdowns, and private notes.
          </p>
        </Link>

        <Link href="/challenges" className={styles.actionCard}>
          <span className={styles.actionIcon} aria-hidden="true">
            🎯
          </span>
          <h3 className={styles.actionTitle}>Challenge Tracks</h3>
          <p className={styles.actionDescription}>
            Review the two parallel challenge tracks, problem statements, and requirements.
          </p>
        </Link>
      </section>

      {/* Two Column Grid: Broadcast Announcement & Audit Trail */}
      <div className={styles.twoColumnGrid}>
        {/* Broadcast Announcement Form */}
        <section className={styles.panelCard} aria-labelledby="broadcast-heading">
          <h2 id="broadcast-heading" className={styles.sectionTitle}>
            📢 Broadcast Live Announcement
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            Broadcast high-priority notices instantly to all connected participants and juries.
          </p>

          {broadcastSuccess ? (
            <Alert tone="success" title="Published">
              {broadcastSuccess}
            </Alert>
          ) : null}

          <form onSubmit={handleBroadcast} className={styles.broadcastForm}>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              maxLength={500}
              placeholder="Type urgent announcement, schedule update, or food notice…"
              className={styles.broadcastTextarea}
              aria-label="Announcement message body"
            />
            <span className={styles.charCount}>{announcementText.length} / 500 characters</span>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isBroadcasting}
              loadingLabel="Broadcasting…"
              disabled={!announcementText.trim()}
            >
              Publish Announcement
            </Button>
          </form>
        </section>

        {/* Audit Log Trail */}
        <section className={styles.panelCard} aria-labelledby="audit-log-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 id="audit-log-heading" className={styles.sectionTitle}>
              🛡️ Administrative Audit Trail
            </h2>
            <Badge tone="neutral">Audited Actions</Badge>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            Tamper-evident record of phase changes, credential revocations, and scans.
          </p>

          <ul className={styles.auditList}>
            {auditLog.map((log) => (
              <li key={log.id} className={styles.auditItem}>
                <div>
                  <div className={styles.auditAction}>{log.action}</div>
                  <div className={styles.auditActor}>
                    By: {log.actorName ?? 'System / Anonymous'}
                  </div>
                </div>
                <div className={styles.auditTime}>
                  {new Date(log.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
