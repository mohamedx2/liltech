'use client';

import { useEffect, useState } from 'react';
import { parseIsoTimestamp } from 'shared';
import styles from './server-countdown.module.css';

export interface CountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly isExpired: boolean;
}

export function calculateCountdown(serverNowMs: number, targetMs: number): CountdownParts {
  const diffMs = Math.max(0, targetMs - serverNowMs);
  if (diffMs === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, isExpired: false };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export interface ServerCountdownProps {
  /** Authoritative ISO 8601 UTC timestamp from the backend. */
  serverTime: string;
  /** Target ISO 8601 UTC timestamp from the backend. */
  targetTime: string;
  label?: string;
  expiredLabel?: string;
}

/**
 * Displays a live countdown anchored to server-provided time rather than
 * trusting the client's wall clock.
 */
export function ServerCountdown({
  serverTime,
  targetTime,
  label = 'Time remaining',
  expiredLabel = 'Window reached',
}: ServerCountdownProps) {
  const serverMs = parseIsoTimestamp(serverTime)?.getTime() ?? null;
  const targetMs = parseIsoTimestamp(targetTime)?.getTime() ?? null;

  const [parts, setParts] = useState<CountdownParts | null>(() => {
    if (serverMs === null || targetMs === null) return null;
    return calculateCountdown(serverMs, targetMs);
  });

  useEffect(() => {
    if (serverMs === null || targetMs === null) {
      setParts(null);
      return;
    }

    const offsetMs = serverMs - Date.now();

    const update = () => {
      setParts(calculateCountdown(Date.now() + offsetMs, targetMs));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [serverMs, targetMs]);

  if (!parts) {
    return null;
  }

  return (
    <div className={styles.countdown}>
      <span className={styles.label}>{label}</span>
      {parts.isExpired ? (
        <span className={styles.done}>{expiredLabel}</span>
      ) : (
        <div
          className={styles.values}
          aria-label={`${label}: ${parts.days}d ${parts.hours}h ${parts.minutes}m ${parts.seconds}s`}
        >
          <span className={styles.unit}>
            <span className={styles.number}>{parts.days}</span>
            <span className={styles.suffix}>d</span>
          </span>
          <span className={styles.unit}>
            <span className={styles.number}>{pad(parts.hours)}</span>
            <span className={styles.suffix}>h</span>
          </span>
          <span className={styles.unit}>
            <span className={styles.number}>{pad(parts.minutes)}</span>
            <span className={styles.suffix}>m</span>
          </span>
          <span className={styles.unit}>
            <span className={styles.number}>{pad(parts.seconds)}</span>
            <span className={styles.suffix}>s</span>
          </span>
        </div>
      )}
    </div>
  );
}
