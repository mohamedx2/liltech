'use client';

import React, { useState, type ReactNode } from 'react';
import type { AdminTeam, BadgeColor, TeamStatus } from 'api-contracts';
import { ApiClientError } from '@/lib/api';
import { Alert } from '@/components/feedback/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import styles from './admin-tools.module.css';

/**
 * Small building blocks shared by the admin operations screens: a
 * confirmation dialog for every destructive or sensitive action, feedback
 * banners, and status/progress badges.
 */

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }
  return (
    <Alert
      tone={feedback.tone}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      title={feedback.tone === 'error' ? 'Action failed' : 'Done'}
    >
      {feedback.message}
    </Alert>
  );
}

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Disables the confirm button (e.g. a required field is empty). */
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Confirms an action before it runs, shows progress while it runs, and keeps
 * the dialog open with the server's message when it fails.
 */
export function ConfirmActionDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  confirmDisabled = false,
  onConfirm,
  onClose,
}: ConfirmActionDialogProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const close = () => {
    if (isRunning) return;
    setFailure(null);
    onClose();
  };

  const confirm = async () => {
    setIsRunning(true);
    setFailure(null);
    try {
      await onConfirm();
      setIsRunning(false);
      onClose();
    } catch (error) {
      setFailure(errorMessage(error, 'The action could not be completed.'));
      setIsRunning(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className={styles.dialogFooter}>
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={isRunning}
            loadingLabel="Working…"
            disabled={confirmDisabled}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        {children}
        {failure ? (
          <Alert tone="error" role="alert" title="Action failed">
            {failure}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

const STATUS_TONE: Record<TeamStatus, BadgeTone> = {
  active: 'success',
  withdrawn: 'neutral',
  disqualified: 'danger',
};

export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const PROGRESS_TONE: Record<AdminTeam['progressState'], BadgeTone> = {
  registered: 'neutral',
  checked_in: 'info',
  ctf_unlocked: 'warning',
  ctf_solved: 'warning',
  challenge_unlocked: 'info',
  submitted: 'success',
};

export function ProgressBadge({ progress }: { progress: AdminTeam['progressState'] }) {
  return <Badge tone={PROGRESS_TONE[progress]}>{progress.replaceAll('_', ' ')}</Badge>;
}

export function ColorDot({ color }: { color: BadgeColor | null }) {
  if (!color) {
    return null;
  }
  return <span className={styles.colorDot} data-color={color} aria-hidden="true" />;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Check-in coverage of one team: `checked / total`. */
export function checkInCount(team: AdminTeam): { checked: number; total: number } {
  return {
    checked: team.participants.filter((participant) => participant.checkedInAt).length,
    total: team.participants.length,
  };
}
