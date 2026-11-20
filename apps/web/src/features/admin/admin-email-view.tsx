'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_BADGE_EMAIL_BODY, DEFAULT_BADGE_EMAIL_SUBJECT } from 'api-contracts';
import { parseEmailBody, type EmailInline } from 'shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FormField, TextInput, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/feedback/alert';
import { ConfirmActionDialog, FeedbackBanner, type Feedback } from './admin-ui';
import styles from './admin-tools.module.css';
import previewStyles from './admin-email-view.module.css';

/**
 * Admin badge email dispatch. Badges are NOT emailed at registration: the
 * organizers send them from here, with the default LilTech template (prefilled
 * below and editable) or their own subject and body. The preview uses the same
 * text parsing as the real email, with a sample recipient.
 */

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

/** Sample recipient used only by the preview. */
const SAMPLE = { participantName: 'Sarra Ben Youssef', teamName: 'Demo Falcons', color: 'Blue' };

function personalize(template: string): string {
  return template
    .replaceAll('[participant name]', SAMPLE.participantName)
    .replaceAll('[team name]', SAMPLE.teamName)
    .replaceAll('[color]', SAMPLE.color);
}

function Inline({ tokens }: { tokens: EmailInline[] }) {
  return (
    <>
      {tokens.map((token, index) =>
        token.kind === 'link' ? (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className={previewStyles.link}
          >
            {token.label ?? token.href}
          </a>
        ) : (
          <React.Fragment key={index}>{token.value}</React.Fragment>
        ),
      )}
    </>
  );
}

/** Mirrors the HTML email the server sends (layout, text blocks, QR card). */
function EmailPreview({ subject, body }: { subject: string; body: string }) {
  const blocks = useMemo(() => parseEmailBody(personalize(body)), [body]);

  return (
    <div className={previewStyles.frame}>
      <div className={previewStyles.meta}>
        <span className={previewStyles.metaLabel}>From</span> LilTech 2026
        <br />
        <span className={previewStyles.metaLabel}>Subject</span> {personalize(subject)}
      </div>
      <div className={previewStyles.email}>
        <div className={previewStyles.header}>
          <div className={previewStyles.wordmark}>
            LilTech <span className={previewStyles.accent}>2026</span>
          </div>
          <div className={previewStyles.tagline}>
            ONE NIGHT · TWO CHALLENGES · NOVEMBER 21–22, 2026
          </div>
        </div>
        <div className={previewStyles.rule} />
        <div className={previewStyles.body}>
          {blocks.map((block, index) =>
            block.kind === 'paragraph' ? (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <React.Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    <Inline tokens={line} />
                  </React.Fragment>
                ))}
              </p>
            ) : (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline tokens={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
          <div className={previewStyles.qrCard}>
            <div className={previewStyles.qrTitle}>Your personal QR badge</div>
            <span className={previewStyles.groupPill}>{SAMPLE.color} group</span>
            <div className={previewStyles.qrPlaceholder} aria-hidden="true">
              QR
            </div>
            <div className={previewStyles.qrName}>{SAMPLE.participantName}</div>
            <div className={previewStyles.qrHint}>Team {SAMPLE.teamName}</div>
          </div>
        </div>
        <div className={previewStyles.footer}>
          LilTech 2026 · Organized by GDG on Campus EPI and ISITCom Google Club
        </div>
      </div>
    </div>
  );
}

export function AdminEmailView() {
  const [subject, setSubject] = useState(DEFAULT_BADGE_EMAIL_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BADGE_EMAIL_BODY);
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastQueued, setLastQueued] = useState<number | null>(null);

  const isDefault =
    subject.trim() === DEFAULT_BADGE_EMAIL_SUBJECT && body.trim() === DEFAULT_BADGE_EMAIL_BODY;
  const isEmpty = !subject.trim() || !body.trim();

  const resetToDefault = () => {
    setSubject(DEFAULT_BADGE_EMAIL_SUBJECT);
    setBody(DEFAULT_BADGE_EMAIL_BODY);
  };

  const handleSend = async () => {
    setIsSending(true);
    setFeedback(null);
    try {
      // The server uses the same default template; only send what was changed.
      const result = await api.admin.sendBadgeEmails(
        isDefault ? {} : { subject: subject.trim(), body: body.trim() },
      );
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
      <section className={styles.hero} aria-labelledby="email-dispatch-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Email Operations</span>
        </div>
        <h1 id="email-dispatch-title" className={styles.title}>
          Badge Email Dispatch
        </h1>
        <p className={styles.description}>
          Badge emails are <strong>not sent automatically</strong> when teams register. When
          registrations are complete, send every participant the welcome email with their personal
          QR badge. The official template is loaded below — adjust it if needed, check the preview,
          then send.
        </p>
      </section>

      <FeedbackBanner feedback={feedback} />

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
        <section className={styles.panel} aria-labelledby="template-heading">
          <div className={styles.panelHeader}>
            <h2 id="template-heading" className={styles.sectionTitle}>
              <span className={styles.sectionIcon} aria-hidden="true">
                <Icon name="zap" />
              </span>
              Email template
            </h2>
            <Button size="sm" variant="outline" onClick={resetToDefault} disabled={isDefault}>
              Reset to default
            </Button>
          </div>
          <p className={styles.hint}>
            <strong>[participant name]</strong>, <strong>[team name]</strong> and{' '}
            <strong>[color]</strong> are replaced for each recipient. Start a line with “•” for a
            bullet, and write <strong>[link text](https://…)</strong> for a named link. The personal
            QR code is always added below the text.
          </p>

          <div className={styles.form}>
            <FormField
              id="email-subject"
              label="Subject line"
              hint={`${subject.length} / ${SUBJECT_MAX} characters`}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={SUBJECT_MAX}
                />
              )}
            </FormField>

            <FormField
              id="email-body"
              label="Email body"
              hint={`${body.length} / ${BODY_MAX} characters`}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={18}
                  maxLength={BODY_MAX}
                />
              )}
            </FormField>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="preview-heading">
          <h2 id="preview-heading" className={styles.sectionTitle}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <Icon name="shield" />
            </span>
            Preview
          </h2>
          <p className={styles.hint}>
            How participants will see the email, shown for a sample participant.
          </p>
          <EmailPreview subject={subject || ' '} body={body} />
        </section>
      </div>

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
          disabled={isEmpty}
          style={{ alignSelf: 'flex-start', marginTop: 'var(--space-3)' }}
        >
          <Icon name="megaphone" /> Send badge emails to all participants
        </Button>
      </section>

      <ConfirmActionDialog
        open={confirmOpen}
        title="Send badge emails to all participants?"
        confirmLabel="Send badge emails"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSend}
      >
        <p style={{ margin: 0 }}>
          Every participant with an email address and an active QR badge will receive “
          {subject.trim()}” immediately{isDefault ? ' (official template)' : ' (edited template)'}.
          The action is audited and cannot be undone.
        </p>
      </ConfirmActionDialog>
    </div>
  );
}
