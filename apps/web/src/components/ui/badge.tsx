import type { ReactNode } from 'react';
import styles from './badge.module.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  showDot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', showDot = false, className, children }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}>
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}
