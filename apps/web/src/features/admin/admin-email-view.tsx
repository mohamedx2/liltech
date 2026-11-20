'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FormField, TextInput, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/feedback/alert';
import { ConfirmActionDialog, FeedbackBanner, type Feedback } from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * Admin badge email dispatch: compose an optional custom template and send QR
 * badge emails to all participants in one operation. Emails are NOT sent
 * automatically on registration — this is the controlled dispatch panel.
 */

const DEFAULT_SUBJECT = 'Your LilTech 2026 QR badge';
const DEFAULT_BODY = `Hi [participant name],

Here is your personal QR badge for LilTech 2026 (team "[team name]").
Your color group: [color].

Show the attached QR code at the entrance on November 21 at Campus EPI, Sousse.
It is personal — do not share it outside your team.

Your team can also display every badge after signing in at the platform.`;

export function AdminEmailView() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastQueued, setLastQueued] = useState<number | null>(null);

  const effectiveSubject = subject.trim() || DEFAULT_SUBJECT;
  const effectiveBody = body.trim() || DEFAULT_BODY;

  const handleSend = async () => {
    setIsSending(true);
    setFeedback(null);
    try {
      const opts: { subject?: string; body?: string } = {};
      if (subject.trim()) opts.subject = subject.trim();
      if (body.trim()) opts.body = body.trim();

      const result = await api.admin.sendBadgeEmails(opts);
      setLastQueued(result.queued);
      setFeedback({
        tone: 'success',
        message:
          result.queued > 0
            ? `${result.queued} badge email(s) queued. They go out one at a time in the background; follow each status on Admin → Teams and use "Retry failed emails" on the control panel for any failure.`
            : 'No participants with an email address and an active badge found.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to send badge emails. Check the API logs and try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Page header ─────────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="email-dispatch-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Email Operations</span>
        </div>
        <h1 id="email-dispatch-title" className={styles.title}>
          Badge Email Dispatch
        </h1>
        <p className={styles.description}>
          Badge emails are <strong>not sent automatically</strong> when teams register. Use this
          panel to send QR badge emails to every participant at once — after registrations close and
          before check-in begins. Leave the fields blank to use the default template, or customize
          the subject and body below.
        </p>
      </section>

      <FeedbackBanner feedback={feedback} />

      {/* ── Last dispatch result ─────────────────────────────────────── */}
      {lastQueued !== null ? (
        <section className={styles.panel} aria-label="Last dispatch result">
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <Icon name="check" />
            </span>
            Last dispatch result
          </h2>
          <dl className={styles.statGrid}>
            <div className={styles.stat}>
              <dt>Queued</dt>
              <dd>{lastQueued}</dd>
            </div>
          </dl>
          <p className={styles.hint}>
            Delivery runs in the background. Each badge moves from pending to sent or failed on{' '}
            <Link className={styles.link} href="/admin/teams">
              Admin → Teams
            </Link>
            .
          </p>
        </section>
      ) : null}

      <div className={styles.twoColumn}>
        {/* ── Template editor ─────────────────────────────────────────── */}
        <section className={styles.panel} aria-labelledby="template-heading">
          <h2 id="template-heading" className={styles.sectionTitle}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <Icon name="zap" />
            </span>
            Email template
          </h2>
          <p className={styles.hint}>
            Leave fields blank to use the default LilTech template. In a custom subject or body,
            [participant name], [team name] and [color] are replaced for each recipient. The QR code
            is always included.
          </p>

          <div className={styles.form}>
            <FormField
              id="email-subject"
              label="Subject line"
              hint={`${subject.length} / 200 characters — blank uses the default`}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={DEFAULT_SUBJECT}
                  maxLength={200}
                />
              )}
            </FormField>

            <FormField
              id="email-body"
              label="Email body"
              hint={`${body.length} / 5000 characters — blank uses the default`}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={DEFAULT_BODY}
                  rows={10}
                  maxLength={5000}
                />
              )}
            </FormField>
          </div>
        </section>

        {/* ── Live preview ─────────────────────────────────────────────── */}
        <section className={styles.panel} aria-labelledby="preview-heading">
          <h2 id="preview-heading" className={styles.sectionTitle}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <Icon name="shield" />
            </span>
            Preview
          </h2>
          <p className={styles.hint}>
            This is how the email will appear, before the markers are replaced. The personal QR code
            is shown below the text.
          </p>

          <div className={styles.secretBox}>
            <p className={styles.strong} style={{ marginBottom: '8px' }}>
              Subject: {effectiveSubject}
            </p>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--color-border)',
                margin: '8px 0',
              }}
            />
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 'var(--text-sm)',
                margin: 0,
              }}
            >
              {effectiveBody}
            </pre>
          </div>

          <Alert tone="info" title="QR code is always included">
            Every email shows the recipient's personal QR badge, whatever the subject and body.
          </Alert>
        </section>
      </div>

      {/* ── Send action ──────────────────────────────────────────────── */}
      <section className={styles.panel} aria-labelledby="send-action-heading">
        <h2 id="send-action-heading" className={styles.sectionTitle}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Icon name="megaphone" />
          </span>
          Send badge emails
        </h2>
        <p className={styles.hint}>
          This sends to <strong>every participant</strong> with an email address and an active
          (non-revoked) QR badge. Revoked badges are skipped. The action is recorded in the audit
          trail.
        </p>

        <Alert tone="warning" title="Irreversible action">
          Participants start receiving emails right away. It also re-sends to participants who
          already received their badge. Confirm registrations are complete and SMTP is configured
          before sending.
        </Alert>

        <Button
          variant="primary"
          size="md"
          onClick={() => setConfirmOpen(true)}
          loading={isSending}
          loadingLabel="Queuing badge emails…"
          style={{ alignSelf: 'flex-start', marginTop: 'var(--space-3)' }}
        >
          <Icon name="megaphone" /> Send badge emails to all participants
        </Button>
      </section>

      {/* ── Confirmation dialog ──────────────────────────────────────── */}
      <ConfirmActionDialog
        open={confirmOpen}
        title="Send badge emails to all participants?"
        confirmLabel="Send badge emails"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSend}
      >
        <p style={{ margin: 0 }}>
          Every participant with an email address and an active QR badge will receive an email
          immediately
          {subject.trim() ? ` with the subject "${subject.trim()}"` : ' with the default subject'}.
          The action is audited and cannot be undone.
        </p>
      </ConfirmActionDialog>
    </div>
  );
}
