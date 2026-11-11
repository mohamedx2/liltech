import type { ReactNode } from 'react';
import styles from './alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}

function ToneIcon({ tone }: { tone: AlertTone }) {
  if (tone === 'success') {
    return (
      <svg
        aria-hidden="true"
        className={styles.icon}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }
  if (tone === 'warning' || tone === 'error') {
    return (
      <svg
        aria-hidden="true"
        className={styles.icon}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function Alert({ tone = 'info', title, children, className, role }: AlertProps) {
  const computedRole = role ?? (tone === 'error' || tone === 'warning' ? 'alert' : 'status');

  return (
    <div
      role={computedRole}
      className={[styles.alert, styles[tone], className].filter(Boolean).join(' ')}
    >
      <ToneIcon tone={tone} />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
