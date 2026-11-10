'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { HealthResponse } from 'api-contracts';

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
      .getHealth()
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

  const colors: Record<Status, string> = {
    loading: 'var(--color-text-muted)',
    ok: 'var(--color-accent)',
    degraded: 'var(--color-warning)',
    unreachable: 'var(--color-danger)',
  };

  return (
    <p
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '0.625rem',
          height: '0.625rem',
          borderRadius: '50%',
          backgroundColor: colors[status],
          flexShrink: 0,
        }}
      />
      {labels[status]}
      {health?.status === 'ok' && (
        <span style={{ color: 'var(--color-text-muted)' }}>
          (server time {new Date(health.timestamp).toLocaleString()})
        </span>
      )}
    </p>
  );
}
