'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EventPhase,
  TEAM_MEMBERS_TOTAL_MAX,
  TEAM_MEMBERS_TOTAL_MIN,
  participantPhoneSchema,
  participantUniversitySchema,
  type AdminParticipant,
  type AdminTeam,
  type ChallengeAdminDetail,
  type TeamStatus,
} from 'api-contracts';
import { api } from '@/lib/api';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, TextInput, Textarea } from '@/components/ui/input';
import { DataTable } from '@/components/ui/table';
import {
  checkInCount,
  ColorDot,
  ConfirmActionDialog,
  errorMessage,
  FeedbackBanner,
  formatTime,
  ProgressBadge,
  TeamStatusBadge,
  type Feedback,
} from './admin-ui';
import styles from './admin-tools.module.css';

/**
 * One team, every fix an organizer may need on event night: rename, change
 * standing (withdraw / disqualify / reactivate), reset the leader password,
 * delete a duplicate before the event, add/edit/remove members, manual
 * check-in and undo, badge reissue/resend/revoke, and Mini-CTF early access.
 * Every action is confirmed first and audited server-side.
 */

type PendingAction =
  | { kind: 'rename' }
  | { kind: 'status'; status: TeamStatus }
  | { kind: 'reset-password' }
  | { kind: 'delete' }
  | { kind: 'add-member' }
  | { kind: 'edit'; participant: AdminParticipant }
  | { kind: 'remove'; participant: AdminParticipant }
  | { kind: 'check-in'; participant: AdminParticipant }
  | { kind: 'undo-check-in'; participant: AdminParticipant }
  | { kind: 'reissue'; participant: AdminParticipant }
  | { kind: 'resend'; participant: AdminParticipant }
  | { kind: 'revoke'; participant: AdminParticipant }
  | { kind: 'grant-ctf'; challenge: ChallengeAdminDetail }
  | { kind: 'revoke-ctf'; challenge: ChallengeAdminDetail };

const PRE_EVENT_PHASES: readonly string[] = [EventPhase.Registration, EventPhase.Checkin];

function emailLabel(participant: AdminParticipant): {
  text: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  if (!participant.email) return { text: 'no email', tone: 'danger' };
  switch (participant.badge?.emailStatus) {
    case 'sent':
      return { text: 'email sent', tone: 'success' };
    case 'failed':
      return { text: 'email failed', tone: 'danger' };
    case 'pending':
      return { text: 'email pending', tone: 'warning' };
    default:
      return { text: 'email not sent', tone: 'neutral' };
  }
}

export function AdminTeamDetailView({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [team, setTeam] = useState<AdminTeam | null>(null);
  const [challenges, setChallenges] = useState<ChallengeAdminDetail[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  // Form fields used by the dialogs.
  const [nameField, setNameField] = useState('');
  const [emailField, setEmailField] = useState('');
  const [universityField, setUniversityField] = useState('');
  const [phoneField, setPhoneField] = useState('');
  const [reasonField, setReasonField] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [loadedTeam, state] = await Promise.all([
        api.admin.getTeam(teamId),
        api.events.getEventState(),
      ]);
      setTeam(loadedTeam);
      setPhase(state.phase);
      const challengeList = await api.admin.getChallenges().catch(() => null);
      setChallenges(challengeList?.items ?? []);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load this team.'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const open = (action: PendingAction) => {
    setFeedback(null);
    if (action.kind === 'rename') {
      setNameField(team?.name ?? '');
    } else if (action.kind === 'edit') {
      setNameField(action.participant.name);
      setEmailField(action.participant.email ?? '');
      setUniversityField(action.participant.university ?? '');
      setPhoneField(action.participant.phone ?? '');
    } else if (action.kind === 'delete') {
      setNameField('');
    } else if (action.kind === 'add-member') {
      setNameField('');
      setEmailField('');
      setUniversityField('');
      setPhoneField('');
    } else if (action.kind === 'status') {
      setReasonField('');
    }
    setPending(action);
  };

  /** Runs a write that returns the refreshed team, then reports success. */
  const applyTeamUpdate = async (call: Promise<AdminTeam>, message: string) => {
    setTeam(await call);
    setFeedback({ tone: 'success', message });
  };

  const runPending = async (): Promise<void> => {
    if (!pending || !team) return;
    switch (pending.kind) {
      case 'rename':
        return applyTeamUpdate(
          api.admin.renameTeam(team.id, { name: nameField.trim() }),
          `Team renamed to “${nameField.trim()}”.`,
        );
      case 'status':
        return applyTeamUpdate(
          api.admin.setTeamStatus(team.id, {
            status: pending.status,
            ...(reasonField.trim() ? { reason: reasonField.trim() } : {}),
          }),
          pending.status === 'active' ? 'Team reactivated.' : `Team marked as ${pending.status}.`,
        );
      case 'reset-password': {
        const result = await api.admin.resetTeamPassword(team.id);
        setRevealedPassword(result.temporaryPassword);
        setFeedback({
          tone: 'success',
          message: `Password reset. ${result.revokedSessions} open session(s) signed out.`,
        });
        return;
      }
      case 'delete':
        await api.admin.deleteTeam(team.id);
        router.push('/admin/teams');
        return;
      case 'add-member':
        return applyTeamUpdate(
          api.admin.addParticipant(team.id, {
            name: nameField.trim(),
            email: emailField.trim(),
            university: universityField.trim(),
            phone: phoneField.trim(),
          }),
          `${nameField.trim()} added. Their badge is being emailed.`,
        );
      case 'edit': {
        const changes = {
          ...(nameField.trim() !== pending.participant.name ? { name: nameField.trim() } : {}),
          ...(emailField.trim() !== (pending.participant.email ?? '')
            ? { email: emailField.trim() }
            : {}),
          // Empty stays unchanged: older registrations have no university or phone yet.
          ...(universityField.trim() &&
          universityField.trim() !== (pending.participant.university ?? '')
            ? { university: universityField.trim() }
            : {}),
          ...(phoneField.trim() && phoneField.trim() !== (pending.participant.phone ?? '')
            ? { phone: phoneField.trim() }
            : {}),
        };
        return applyTeamUpdate(
          api.admin.updateParticipant(pending.participant.id, changes),
          `${nameField.trim()} updated.${changes.email ? ' Resend the badge email to the new address if needed.' : ''}`,
        );
      }
      case 'remove':
        return applyTeamUpdate(
          api.admin.removeParticipant(pending.participant.id),
          `${pending.participant.name} removed from the team.`,
        );
      case 'check-in':
        return applyTeamUpdate(
          api.admin.checkInParticipant(pending.participant.id),
          `${pending.participant.name} checked in.`,
        );
      case 'undo-check-in':
        return applyTeamUpdate(
          api.admin.undoCheckIn(pending.participant.id),
          `Check-in of ${pending.participant.name} undone.`,
        );
      case 'reissue': {
        const result = await api.admin.reissueBadge(pending.participant.id);
        setTeam(await api.admin.getTeam(team.id));
        setFeedback({
          tone: 'success',
          message: result.emailQueued
            ? `New badge issued for ${pending.participant.name} and emailed. The old QR code no longer works.`
            : `New badge issued for ${pending.participant.name}. No email on file — the team can show it from its portal.`,
        });
        return;
      }
      case 'resend': {
        const result = await api.admin.resendBadgeEmail(pending.participant.id);
        setTeam(await api.admin.getTeam(team.id));
        setFeedback({
          tone: result.emailStatus === 'failed' ? 'error' : 'success',
          message:
            result.emailStatus === 'failed'
              ? `The badge email to ${pending.participant.name} failed again. Check the address.`
              : `Badge email sent to ${pending.participant.name}.`,
        });
        return;
      }
      case 'revoke':
        await api.admin.revokeBadge(pending.participant.id);
        setTeam(await api.admin.getTeam(team.id));
        setFeedback({
          tone: 'success',
          message: `${pending.participant.name}'s badge is revoked. Reissue it to make a new one.`,
        });
        return;
      case 'grant-ctf':
        return applyTeamUpdate(
          api.admin.grantCtfSolve(team.id, pending.challenge.id),
          `Early access to “${pending.challenge.title}” granted.`,
        );
      case 'revoke-ctf':
        return applyTeamUpdate(
          api.admin.revokeCtfSolve(team.id, pending.challenge.id),
          `Early access to “${pending.challenge.title}” withdrawn.`,
        );
    }
  };

  if (isLoading && !team) {
    return <LoadingState message="Loading team..." />;
  }

  if (loadError && !team) {
    return (
      <ErrorState
        title="Team unavailable"
        message={loadError}
        onRetry={loadData}
        action={
          <Link className={styles.link} href="/admin/teams">
            Back to teams
          </Link>
        }
      />
    );
  }

  if (!team) {
    return null;
  }

  const { checked, total } = checkInCount(team);
  const canDelete = phase !== null && PRE_EVENT_PHASES.includes(phase);
  const isFull = team.participants.length >= TEAM_MEMBERS_TOTAL_MAX;
  const solvedIds = new Set(team.ctfSolves.map((solve) => solve.challengeId));

  return (
    <div className={styles.container}>
      <nav aria-label="Breadcrumb">
        <Link className={styles.link} href="/admin/teams">
          ← All teams
        </Link>
      </nav>

      <section className={styles.hero} aria-labelledby="team-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Team</span>
          <div className={styles.badgeRow}>
            <TeamStatusBadge status={team.status} />
            <ProgressBadge progress={team.progressState} />
            <Badge tone={checked === total ? 'success' : checked > 0 ? 'warning' : 'neutral'}>
              {checked} / {total} checked in
            </Badge>
          </div>
        </div>
        <h1 id="team-title" className={styles.title}>
          {team.name}
        </h1>
        <p className={styles.description}>
          Team login: <strong>{team.leader.email}</strong> · registered {formatTime(team.createdAt)}
        </p>
        {team.status !== 'active' ? (
          <Alert tone="warning" title={`Team ${team.status}`}>
            {team.statusReason ?? 'No reason recorded.'} ({formatTime(team.statusChangedAt)}). The
            team cannot be checked in or read challenges.
          </Alert>
        ) : null}
        {team.participants.length < TEAM_MEMBERS_TOTAL_MIN ? (
          <Alert tone="warning" title="Below minimum team size">
            The team has {team.participants.length} member(s); the rules require at least{' '}
            {TEAM_MEMBERS_TOTAL_MIN}.
          </Alert>
        ) : null}
      </section>

      <FeedbackBanner feedback={feedback} />

      <section className={styles.panel} aria-labelledby="team-actions-heading">
        <h2 id="team-actions-heading" className={styles.sectionTitle}>
          Team actions
        </h2>
        <div className={styles.actions}>
          <Button variant="outline" size="sm" onClick={() => open({ kind: 'rename' })}>
            Rename
          </Button>
          <Button variant="outline" size="sm" onClick={() => open({ kind: 'reset-password' })}>
            Reset password
          </Button>
          {team.status === 'active' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => open({ kind: 'status', status: 'withdrawn' })}
              >
                Withdraw
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => open({ kind: 'status', status: 'disqualified' })}
              >
                Disqualify
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => open({ kind: 'status', status: 'active' })}
            >
              Reactivate
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => open({ kind: 'delete' })}
            disabled={!canDelete}
          >
            Delete team
          </Button>
        </div>
        <p className={styles.hint}>
          {canDelete
            ? 'Delete is for duplicate, test or spam registrations and removes the team account.'
            : 'Teams can only be deleted before the event goes live — withdraw or disqualify instead.'}
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="members-heading">
        <div className={styles.panelHeader}>
          <h2 id="members-heading" className={styles.sectionTitle}>
            Members ({team.participants.length} / {TEAM_MEMBERS_TOTAL_MAX})
          </h2>
          <Button
            variant="primary"
            size="sm"
            onClick={() => open({ kind: 'add-member' })}
            disabled={isFull}
          >
            Add member
          </Button>
        </div>
        <DataTable
          caption="Team members with check-in and badge state"
          rows={team.participants}
          getRowKey={(participant) => participant.id}
          columns={[
            {
              key: 'name',
              header: 'Member',
              render: (participant) => (
                <div className={styles.cellStack}>
                  <span className={styles.strong}>
                    <ColorDot color={participant.color} />
                    {participant.name}
                    {participant.isLeader ? ' (leader)' : ''}
                  </span>
                  <span className={styles.small}>{participant.email ?? 'No email on file'}</span>
                  <span className={styles.small}>
                    {participant.university ?? 'No university on file'}
                    {' · '}
                    {participant.phone ? (
                      <a href={`tel:${participant.phone.replace(/[^0-9+]/g, '')}`}>
                        {participant.phone}
                      </a>
                    ) : (
                      'No mobile number on file'
                    )}
                  </span>
                </div>
              ),
            },
            {
              key: 'checkin',
              header: 'Check-in',
              render: (participant) =>
                participant.checkedInAt ? (
                  <div className={styles.cellStack}>
                    <Badge tone="success" showDot>
                      Checked in
                    </Badge>
                    <span className={styles.small}>
                      {formatTime(participant.checkedInAt)} · {participant.checkedInByName ?? '—'}
                    </span>
                  </div>
                ) : (
                  <Badge tone="neutral">Not checked in</Badge>
                ),
            },
            {
              key: 'badge',
              header: 'Badge',
              render: (participant) => {
                const email = emailLabel(participant);
                return (
                  <div className={styles.badgeRow}>
                    {participant.badge?.revokedAt ? (
                      <Badge tone="danger">revoked</Badge>
                    ) : participant.badge ? (
                      <Badge tone="info">active</Badge>
                    ) : (
                      <Badge tone="neutral">no badge</Badge>
                    )}
                    <Badge tone={email.tone}>{email.text}</Badge>
                  </div>
                );
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (participant) => (
                <div className={styles.actions}>
                  {participant.checkedInAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open({ kind: 'undo-check-in', participant })}
                    >
                      Undo check-in
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => open({ kind: 'check-in', participant })}
                      disabled={team.status !== 'active'}
                    >
                      Check in manually
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => open({ kind: 'edit', participant })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => open({ kind: 'resend', participant })}
                    disabled={!participant.email || Boolean(participant.badge?.revokedAt)}
                  >
                    Resend email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => open({ kind: 'reissue', participant })}
                  >
                    Reissue badge
                  </Button>
                  {participant.badge && !participant.badge.revokedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => open({ kind: 'revoke', participant })}
                    >
                      Revoke badge
                    </Button>
                  ) : null}
                  {!participant.isLeader ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => open({ kind: 'remove', participant })}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className={styles.panel} aria-labelledby="ctf-heading">
        <h2 id="ctf-heading" className={styles.sectionTitle}>
          Mini-CTF early access
        </h2>
        <p className={styles.hint}>
          A team that solved a challenge&apos;s Mini-CTF reads it before the public reveal. Grant it
          by hand when a valid flag was rejected or the CTF was down.
        </p>
        {challenges.length === 0 ? (
          <p className={styles.hint}>
            No challenge configured yet.{' '}
            <Link className={styles.link} href="/admin/challenges">
              Configure challenges
            </Link>
          </p>
        ) : (
          <ul className={styles.list}>
            {challenges.map((challenge) => {
              const solve = team.ctfSolves.find((item) => item.challengeId === challenge.id);
              return (
                <li key={challenge.id} className={styles.listItem}>
                  <div className={styles.listItemBody}>
                    <span className={styles.strong}>
                      {challenge.position}. {challenge.title}
                    </span>
                    <span className={styles.small}>
                      {solve
                        ? `Early access since ${formatTime(solve.solvedAt)}`
                        : 'No early access'}{' '}
                      · challenge {challenge.status}
                    </span>
                  </div>
                  {solvedIds.has(challenge.id) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open({ kind: 'revoke-ctf', challenge })}
                    >
                      Withdraw access
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => open({ kind: 'grant-ctf', challenge })}
                      disabled={team.status !== 'active'}
                    >
                      Grant early access
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pending ? (
        <PendingActionDialog
          action={pending}
          team={team}
          nameField={nameField}
          emailField={emailField}
          universityField={universityField}
          phoneField={phoneField}
          reasonField={reasonField}
          onNameChange={setNameField}
          onEmailChange={setEmailField}
          onUniversityChange={setUniversityField}
          onPhoneChange={setPhoneField}
          onReasonChange={setReasonField}
          onConfirm={runPending}
          onClose={() => setPending(null)}
        />
      ) : null}

      {revealedPassword ? (
        <Dialog
          open
          onClose={() => setRevealedPassword(null)}
          title="Temporary team password"
          footer={
            <div className={styles.dialogFooter}>
              <Button size="sm" variant="primary" onClick={() => setRevealedPassword(null)}>
                Done
              </Button>
            </div>
          }
        >
          <div className={styles.form}>
            <p style={{ margin: 0 }}>
              Give this password to the team leader ({team.leader.email}). It is shown only once and
              is not stored readable.
            </p>
            <code className={styles.secretBox}>{revealedPassword}</code>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

interface PendingActionDialogProps {
  action: PendingAction;
  team: AdminTeam;
  nameField: string;
  emailField: string;
  universityField: string;
  phoneField: string;
  reasonField: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onUniversityChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidUniversity = (value: string) => participantUniversitySchema.safeParse(value).success;
const isValidPhone = (value: string) => participantPhoneSchema.safeParse(value).success;

function PendingActionDialog({
  action,
  team,
  nameField,
  emailField,
  universityField,
  phoneField,
  reasonField,
  onNameChange,
  onEmailChange,
  onUniversityChange,
  onPhoneChange,
  onReasonChange,
  onConfirm,
  onClose,
}: PendingActionDialogProps) {
  const common = { open: true, onConfirm, onClose };

  const nameInput = (label: string) => (
    <FormField label={label} required>
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          value={nameField}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={100}
          autoFocus
        />
      )}
    </FormField>
  );

  const emailInput = (
    <FormField label="Email" required hint="The QR badge is sent here.">
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          type="email"
          value={emailField}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      )}
    </FormField>
  );

  const universityInput = (required: boolean) => (
    <FormField label="University" required={required} hint="University or school.">
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          value={universityField}
          onChange={(event) => onUniversityChange(event.target.value)}
          maxLength={120}
        />
      )}
    </FormField>
  );

  const phoneInput = (required: boolean) => (
    <FormField label="Mobile number" required={required} hint="For example +216 20 123 456.">
      {({ id, describedBy }) => (
        <TextInput
          id={id}
          aria-describedby={describedBy}
          type="tel"
          inputMode="tel"
          value={phoneField}
          onChange={(event) => onPhoneChange(event.target.value)}
          maxLength={20}
        />
      )}
    </FormField>
  );

  switch (action.kind) {
    case 'rename':
      return (
        <ConfirmActionDialog
          {...common}
          title="Rename team"
          confirmLabel="Rename"
          confirmDisabled={nameField.trim().length < 3 || nameField.trim() === team.name}
        >
          {nameInput('Team name (3–60 characters)')}
        </ConfirmActionDialog>
      );
    case 'status': {
      const reactivate = action.status === 'active';
      return (
        <ConfirmActionDialog
          {...common}
          title={
            reactivate
              ? 'Reactivate team'
              : action.status === 'withdrawn'
                ? 'Withdraw team'
                : 'Disqualify team'
          }
          tone={reactivate ? 'primary' : 'danger'}
          confirmLabel={reactivate ? 'Reactivate' : `Mark ${action.status}`}
          confirmDisabled={!reactivate && !reasonField.trim()}
        >
          <p style={{ margin: 0 }}>
            {reactivate
              ? `“${team.name}” will be able to check in and read challenges again.`
              : `“${team.name}” will no longer be able to check in or read challenges. Its history is kept and this can be reversed.`}
          </p>
          {!reactivate ? (
            <FormField label="Reason (visible to administrators)" required>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={reasonField}
                  onChange={(event) => onReasonChange(event.target.value)}
                  maxLength={300}
                  rows={3}
                  autoFocus
                />
              )}
            </FormField>
          ) : null}
        </ConfirmActionDialog>
      );
    }
    case 'reset-password':
      return (
        <ConfirmActionDialog {...common} title="Reset team password" confirmLabel="Reset password">
          <p style={{ margin: 0 }}>
            A new temporary password is generated for <strong>{team.leader.email}</strong>. Every
            open session of the team is signed out. Verify the leader&apos;s identity first.
          </p>
        </ConfirmActionDialog>
      );
    case 'delete':
      return (
        <ConfirmActionDialog
          {...common}
          title="Delete team"
          tone="danger"
          confirmLabel="Delete permanently"
          confirmDisabled={nameField.trim() !== team.name}
        >
          <Alert tone="error" title="This cannot be undone">
            “{team.name}”, its {team.participants.length} members, their badges and the team account
            are permanently deleted.
          </Alert>
          <FormField label={`Type the team name (${team.name}) to confirm`} required>
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                value={nameField}
                onChange={(event) => onNameChange(event.target.value)}
                autoComplete="off"
              />
            )}
          </FormField>
        </ConfirmActionDialog>
      );
    case 'add-member':
      return (
        <ConfirmActionDialog
          {...common}
          title="Add member"
          confirmLabel="Add and email badge"
          confirmDisabled={
            !nameField.trim() ||
            !EMAIL_PATTERN.test(emailField.trim()) ||
            !isValidUniversity(universityField) ||
            !isValidPhone(phoneField)
          }
        >
          {nameInput('Full name')}
          {emailInput}
          {universityInput(true)}
          {phoneInput(true)}
          <p className={styles.hint}>
            The new member gets a balanced badge color and a QR badge by email.
          </p>
        </ConfirmActionDialog>
      );
    case 'edit': {
      const unchanged =
        nameField.trim() === action.participant.name &&
        emailField.trim() === (action.participant.email ?? '') &&
        universityField.trim() === (action.participant.university ?? '') &&
        phoneField.trim() === (action.participant.phone ?? '');
      const invalidOptional =
        (universityField.trim() !== '' && !isValidUniversity(universityField)) ||
        (phoneField.trim() !== '' && !isValidPhone(phoneField));
      return (
        <ConfirmActionDialog
          {...common}
          title={`Edit ${action.participant.name}`}
          confirmLabel="Save"
          confirmDisabled={
            unchanged ||
            invalidOptional ||
            !nameField.trim() ||
            !EMAIL_PATTERN.test(emailField.trim())
          }
        >
          {nameInput('Full name')}
          {emailInput}
          {universityInput(false)}
          {phoneInput(false)}
          {action.participant.isLeader ? (
            <Alert tone="warning" title="Team leader">
              Changing this email also changes the team login.
            </Alert>
          ) : null}
        </ConfirmActionDialog>
      );
    }
    case 'remove':
      return (
        <ConfirmActionDialog {...common} title="Remove member" tone="danger" confirmLabel="Remove">
          <p style={{ margin: 0 }}>
            Remove <strong>{action.participant.name}</strong> from “{team.name}”? Their badge stops
            working and their check-in is deleted.
            {team.participants.length - 1 < TEAM_MEMBERS_TOTAL_MIN
              ? ` The team will drop below the minimum of ${TEAM_MEMBERS_TOTAL_MIN} members.`
              : ''}
          </p>
        </ConfirmActionDialog>
      );
    case 'check-in':
      return (
        <ConfirmActionDialog {...common} title="Manual check-in" confirmLabel="Check in">
          <p style={{ margin: 0 }}>
            Check in <strong>{action.participant.name}</strong> without scanning their QR code.
            Verify their identity (ID card, team leader) first.
          </p>
        </ConfirmActionDialog>
      );
    case 'undo-check-in':
      return (
        <ConfirmActionDialog {...common} title="Undo check-in" confirmLabel="Undo check-in">
          <p style={{ margin: 0 }}>
            Mark <strong>{action.participant.name}</strong> as not checked in? Use this for a wrong
            scan or someone who left before the start.
          </p>
        </ConfirmActionDialog>
      );
    case 'reissue':
      return (
        <ConfirmActionDialog {...common} title="Reissue badge" confirmLabel="Issue new badge">
          <p style={{ margin: 0 }}>
            A new QR badge is issued for <strong>{action.participant.name}</strong>
            {action.participant.email ? ` and emailed to ${action.participant.email}` : ''}. The
            current QR code stops working immediately
            {action.participant.badge?.revokedAt ? ', and the revocation is lifted' : ''}.
          </p>
        </ConfirmActionDialog>
      );
    case 'resend':
      return (
        <ConfirmActionDialog {...common} title="Resend badge email" confirmLabel="Send email">
          <p style={{ margin: 0 }}>
            Send the current badge of <strong>{action.participant.name}</strong> to{' '}
            {action.participant.email} again.
          </p>
        </ConfirmActionDialog>
      );
    case 'revoke':
      return (
        <ConfirmActionDialog {...common} title="Revoke badge" tone="danger" confirmLabel="Revoke">
          <p style={{ margin: 0 }}>
            The QR badge of <strong>{action.participant.name}</strong> stops working (leaked or
            shared code). Reissue it later to give them a new one.
          </p>
        </ConfirmActionDialog>
      );
    case 'grant-ctf':
      return (
        <ConfirmActionDialog {...common} title="Grant Mini-CTF early access" confirmLabel="Grant">
          <p style={{ margin: 0 }}>
            “{team.name}” will be treated as having solved the Mini-CTF of “{action.challenge.title}
            ” and can read it before the public reveal.
          </p>
        </ConfirmActionDialog>
      );
    case 'revoke-ctf':
      return (
        <ConfirmActionDialog
          {...common}
          title="Withdraw Mini-CTF early access"
          tone="danger"
          confirmLabel="Withdraw"
        >
          <p style={{ margin: 0 }}>
            “{team.name}” loses early access to “{action.challenge.title}” until the public reveal.
          </p>
        </ConfirmActionDialog>
      );
  }
}
