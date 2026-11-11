'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { HealthResponse } from 'api-contracts';
import styles from './api-status.module.css';

type Status = 'loading' | 'ok' | 'degraded' | 'unreachable';

/**
 * Shows live API connectivity on the landing page.
 * Exercises the centralized API client end-to-end (loading / success / error
 * states) and verifies the configured `NEXT_PUBLIC_API_URL`.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>('loading');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    api
      .getHealth({ signal: controller.signal })
      .then((result) => {
        setHealth(result);
        setStatus(result.database.status === 'up' ? 'ok' : 'degraded');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError) {
          setStatus(error.isNetworkError ? 'unreachable' : 'degraded');
        } else {
          setStatus('unreachable');
        }
      });

    return () => controller.abort();
  }, []);

  const labels: Record<Status, string> = {
    loading: 'Checking platform status…',
    ok: 'Platform online — database connected',
    degraded: 'Platform online — database unreachable',
    unreachable: 'Platform API unreachable',
  };

  return (
    <p role="status" aria-live="polite" className={styles.status}>
      <span aria-hidden="true" className={`${styles.dot} ${styles[status]}`} />
      <span>{labels[status]}</span>
      {health?.status === 'ok' ? (
        <span>(server time {new Date(health.timestamp).toLocaleString()})</span>
      ) : null}
    </p>
  );
}
