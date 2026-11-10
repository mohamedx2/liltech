'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './dialog.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

/**
 * Accessible modal dialog built on the native HTML `<dialog>` element (`showModal()`).
 * Browser top-layer handles inert background, focus containment, Esc dismissal, and focus return.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Close dialog',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      if (typeof el.showModal === 'function') {
        el.showModal();
      } else {
        el.setAttribute('open', '');
      }
    } else if (!open && el.open) {
      if (typeof el.close === 'function') {
        el.close();
      } else {
        el.removeAttribute('open');
      }
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      className={styles.dialog}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  );
}
