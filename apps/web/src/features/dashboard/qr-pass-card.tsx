'use client';

import React, { useState } from 'react';
import type { BadgeColor } from 'api-contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import { api, ApiClientError } from '@/lib/api';
import type { TeamBadgesResponse, TeamMemberBadge } from '@/lib/api/contracts/pending';
import styles from './qr-pass-card.module.css';

const COLOR_LABELS: Record<BadgeColor, string> = {
  blue: 'Blue',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function emailStatusLabel(badge: TeamMemberBadge): string {
  if (!badge.email) return 'No email on file';
  if (badge.emailStatus === 'sent') return `Emailed to ${badge.email}`;
  if (badge.emailStatus === 'failed') return `Email to ${badge.email} failed`;
  if (badge.emailStatus === 'pending') return `Sending to ${badge.email}…`;
  return `Not emailed yet (${badge.email})`;
}

function MemberBadge({ badge }: { badge: TeamMemberBadge }) {
  const [state, setState] = useState(badge);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  const canResend =
    Boolean(state.email) &&
    !state.isRevoked &&
    (!state.emailResendAvailableAt ||
      new Date(state.emailResendAvailableAt).getTime() <= Date.now());

  const handleResend = async () => {
    setIsSending(true);
    setFeedback(null);
    try {
      const result = await api.participants.resendBadgeEmail(state.participantId);
      setState((previous) => ({
        ...previous,
        emailStatus: result.emailStatus,
        emailLastSentAt: result.emailLastSentAt,
        emailResendAvailableAt: result.emailResendAvailableAt,
      }));
      setFeedback(
        result.emailStatus === 'sent'
          ? { tone: 'success', text: 'Badge email sent.' }
          : { tone: 'error', text: 'The email could not be sent. Show the QR code below instead.' },
      );
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof ApiClientError ? error.message : 'Could not resend the email.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const colorClass = state.color ? styles[`color_${state.color}`] : styles.color_none;

  return (
    <li className={[styles.member, colorClass].filter(Boolean).join(' ')}>
      <div className={styles.memberHeader}>
        <div>
          <span className={styles.memberName}>{state.participantName}</span>
          <span className={styles.memberRole}>
            {state.roleInTeam === 'leader' ? 'Team leader' : 'Member'}
          </span>
        </div>
        <span className={styles.colorChip}>
          {state.color ? `${COLOR_LABELS[state.color]} group` : 'No color'}
        </span>
      </div>

      <div className={styles.qrContainer}>
        {state.qrImageDataUrl ? (
          <img
            src={state.qrImageDataUrl}
            alt={`Entrance QR code for ${state.participantName}`}
            className={styles.qrImage}
            width={180}
            height={180}
          />
        ) : (
          <p className={styles.qrMissing}>
            {state.isRevoked
              ? 'This badge was revoked. Please contact the organizers.'
              : 'This QR code can no longer be displayed. Resend the email to get a new one.'}
          </p>
        )}
      </div>

      <div className={styles.statusRow}>
        {state.isCheckedIn ? (
          <Badge tone="success" showDot>
            Checked in
          </Badge>
        ) : state.isRevoked ? (
          <Badge tone="danger">Revoked</Badge>
        ) : (
          <Badge tone="info">Ready to scan</Badge>
        )}
        <span className={styles.emailStatus}>{emailStatusLabel(state)}</span>
      </div>

      <div className={styles.actions}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResend}
          disabled={!canResend}
          loading={isSending}
          loadingLabel="Sending…"
        >
          Resend email
        </Button>
        {!canResend && state.emailResendAvailableAt && !state.isRevoked ? (
          <span className={styles.resendHint}>
            Available at {formatTime(state.emailResendAvailableAt)}
          </span>
        ) : null}
      </div>

      {feedback ? (
        <p
          role="status"
          className={feedback.tone === 'success' ? styles.feedbackOk : styles.feedbackError}
        >
          {feedback.text}
        </p>
      ) : null}
    </li>
  );
}

export interface QrPassCardProps {
  badges: TeamBadgesResponse;
  className?: string;
}

/** Every member's entrance QR badge, readable on a phone at check-in. */
export function QrPassCard({ badges, className = '' }: QrPassCardProps) {
  return (
    <Card surface="raised" className={[styles.card, className].filter(Boolean).join(' ')}>
      <CardHeader>
        <CardTitle as="h2">Entrance QR Badges</CardTitle>
        <CardDescription>
          Each member shows their own QR code at the entrance. Codes were also sent by email.
        </CardDescription>
      </CardHeader>

      <CardContent className={styles.content}>
        <ul className={styles.memberList}>
          {badges.badges.map((badge) => (
            <MemberBadge key={badge.participantId} badge={badge} />
          ))}
        </ul>

        <Alert tone="warning" title="Personal credentials">
          Each QR code admits one person and can be scanned once. Do not share them outside your
          team.
        </Alert>
      </CardContent>
    </Card>
  );
}
