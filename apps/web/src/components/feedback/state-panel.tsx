import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { Alert } from './alert';
import styles from './state-panel.module.css';

export function LoadingState({
  title = 'Loading',
  message = 'Fetching the latest information…',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className={styles.panel}>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      <progress aria-label={title} />
      <div className={styles.skeletonLine} aria-hidden="true" />
      <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} aria-hidden="true" />
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  action,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <Alert tone="error" title={title} role="alert">
      <p>{message}</p>
      {onRetry || action ? (
        <div className={styles.actions} style={{ marginTop: 'var(--space-3)' }}>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </Alert>
  );
}

export function SuccessState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Alert tone="success" title={title} role="status">
      <p>{message}</p>
      {action ? (
        <div className={styles.actions} style={{ marginTop: 'var(--space-3)' }}>
          {action}
        </div>
      ) : null}
    </Alert>
  );
}
