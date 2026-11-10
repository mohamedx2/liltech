import type { ReactNode } from 'react';
import styles from './page-container.module.css';

export function PageContainer({
  narrow = false,
  className,
  children,
}: {
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[styles.container, narrow ? styles.narrow : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
