'use client';

import { useEffect, useState } from 'react';
import { EventPhase } from 'api-contracts';
import { assertNever } from 'shared';
import { api, ApiClientError } from '@/lib/api';
import type { EventStateResponse } from '@/lib/api/contracts/pending';
import { Badge, type BadgeTone } from '../ui/badge';
import { ServerCountdown } from './server-countdown';
import styles from './event-phase-banner.module.css';

interface PhaseMeta {
  readonly label: string;
  readonly description: string;
  readonly tone: BadgeTone;
}

export function getPhaseMeta(phase: EventPhase): PhaseMeta {
  switch (phase) {
    case EventPhase.Registration:
      return {
        label: 'Registration Open',
        description: 'Team leaders can register teams of 4–7 participants ahead of the event.',
        tone: 'info',
      };
    case EventPhase.Checkin:
      return {
        label: 'Check-In Active',
        description: 'Participants check in at Campus EPI entrance with their personal QR badge.',
        tone: 'warning',
      };
    case EventPhase.Live:
      return {
        label: 'Event Live',
        description: 'Mini-CTF gate is open. Solve a flag to unlock your main challenge track.',
        tone: 'success',
      };
    case EventPhase.SubmissionsClosed:
      return {
        label: 'Submissions Closed',
        description: 'Deliverable window has ended (08:00). Prepare for morning pitches.',
        tone: 'warning',
      };
    case EventPhase.Pitching:
      return {
        label: 'Pitching & Jury Review',
        description: 'Teams present to their track jury from 09:00 while evaluations are recorded.',
        tone: 'info',
      };
    case EventPhase.Results:
      return {
        label: 'Results Published',
        description: 'Final rankings and podiums for both challenge tracks are published.',
        tone: 'success',
      };
    default:
      return assertNever(phase, 'event phase');
  }
}

export function EventPhaseBanner() {
  const [state, setState] = useState<EventStateResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending-backend' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    api.events
      .getEventState({ signal: controller.signal })
      .then((result) => {
        setState(result);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && (error.status === 404 || error.status === 501)) {
          setStatus('pending-backend');
          return;
        }
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load live event phase.',
        );
      });

    return () => controller.abort();
  }, []);

  if (status === 'loading') {
    return (
      <section className={styles.banner} aria-label="Event status" aria-busy="true">
        <div className={styles.summary}>
          <Badge tone="neutral">Loading phase</Badge>
          <p className={styles.description}>Synchronizing schedule with the server clock…</p>
        </div>
      </section>
    );
  }

  if (status === 'pending-backend') {
    return (
      <section className={styles.banner} aria-label="Event status">
        <div className={styles.summary}>
          <div className={styles.headingRow}>
            <Badge tone="neutral" showDot>
              Event State Pending API
            </Badge>
            <span className={styles.title}>Scheduled for November 21–22, 2026</span>
          </div>
          <p className={styles.description}>
            Live phase synchronization will appear once the backend event-state endpoint is deployed
            (or switch <code>NEXT_PUBLIC_API_MODE=mock</code> for UI preview).
          </p>
        </div>
      </section>
    );
  }

  if (status === 'error' || !state) {
    return (
      <section className={styles.banner} aria-label="Event status">
        <div className={styles.summary}>
          <div className={styles.headingRow}>
            <Badge tone="danger" showDot>
              Phase Unavailable
            </Badge>
          </div>
          <p className={styles.description}>{errorMessage ?? 'Could not retrieve event state.'}</p>
        </div>
      </section>
    );
  }

  const meta = getPhaseMeta(state.phase);
  const nextLabel = state.nextPhase ? `Next: ${getPhaseMeta(state.nextPhase).label}` : 'Countdown';

  return (
    <section
      className={`${styles.banner} ${state.phase === EventPhase.Live ? styles.live : ''}`}
      aria-label="Event phase"
    >
      <div className={styles.summary}>
        <div className={styles.headingRow}>
          <Badge tone={meta.tone} showDot>
            {meta.label}
          </Badge>
          {state.phaseLabel ? (
            <span className={styles.description}>({state.phaseLabel})</span>
          ) : null}
        </div>
        <p className={styles.description}>{meta.description}</p>
      </div>

      {state.nextPhaseAt ? (
        <ServerCountdown
          serverTime={state.serverTime}
          targetTime={state.nextPhaseAt}
          label={nextLabel}
        />
      ) : null}
    </section>
  );
}
