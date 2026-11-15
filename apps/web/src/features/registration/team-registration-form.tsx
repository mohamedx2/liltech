'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { TEAM_MEMBERS_TOTAL_MAX, TEAM_MEMBERS_TOTAL_MIN } from 'api-contracts';
import { Button, buttonClassName } from '@/components/ui/button';
import { FormField, TextInput } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api';
import {
  teamRegistrationRequestSchema,
  type TeamMemberInput,
  type TeamRegistrationResponse,
} from '@/lib/api/contracts/pending';
import styles from './team-registration-form.module.css';

interface MemberRow extends TeamMemberInput {
  readonly rowKey: number;
}

interface RegistrationErrors {
  teamName?: string;
  password?: string;
  leaderFullName?: string;
  leaderEmail?: string;
  teammates: Record<number, { fullName?: string; email?: string }>;
  roster?: string;
}

/** Teammates exclude the leader, so each bound is one below the team size. */
const MIN_TEAMMATES = TEAM_MEMBERS_TOTAL_MIN - 1;
const MAX_TEAMMATES = TEAM_MEMBERS_TOTAL_MAX - 1;

const NO_ERRORS: RegistrationErrors = { teammates: {} };

/**
 * Maps API error details (`{ path: 'members.1.email', message }`) onto the
 * form fields. Request member index N is teammate row N.
 */
function serverFieldErrors(details: unknown, rows: readonly MemberRow[]): RegistrationErrors {
  const errors: RegistrationErrors = { teammates: {} };
  if (!Array.isArray(details)) return errors;

  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) continue;
    const { path, message } = detail as { path?: unknown; message?: unknown };
    if (typeof path !== 'string' || typeof message !== 'string') continue;

    const [root, second, third] = path.split('.');
    if (root === 'teamName') {
      errors.teamName ??= message;
    } else if (root === 'leader' && second === 'email') {
      errors.leaderEmail ??= message;
    } else if (root === 'leader' && second === 'name') {
      errors.leaderFullName ??= message;
    } else if (root === 'leader' && second === 'password') {
      errors.password ??= message;
    } else if (root === 'members' && (third === 'email' || third === 'name')) {
      const row = rows[Number(second)];
      if (row) {
        const field = third === 'email' ? 'email' : 'fullName';
        const rowErrors = (errors.teammates[row.rowKey] ??= {});
        rowErrors[field] ??= message;
      }
    }
  }

  return errors;
}

function emptyRow(rowKey: number): MemberRow {
  return { rowKey, fullName: '', email: '' };
}

function hasErrors(errors: RegistrationErrors): boolean {
  return Boolean(
    errors.teamName ||
    errors.password ||
    errors.leaderFullName ||
    errors.leaderEmail ||
    errors.roster ||
    Object.values(errors.teammates).some((row) => row.fullName || row.email),
  );
}

/**
 * Single-page team registration: team, leader, and teammates on one form with
 * one submit. Client validation mirrors the server contract for fast feedback;
 * the backend remains the authority on every rule.
 */
export function TeamRegistrationForm() {
  const nextRowKeyRef = useRef(MIN_TEAMMATES + 1);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [leaderName, setLeaderName] = useState('');
  const [leaderEmail, setLeaderEmail] = useState('');
  const [teammates, setTeammates] = useState<MemberRow[]>(() =>
    Array.from({ length: MIN_TEAMMATES }, (_, index) => emptyRow(index + 1)),
  );

  const [errors, setErrors] = useState<RegistrationErrors>(NO_ERRORS);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<TeamRegistrationResponse | null>(null);
  const [copiedBadgeId, setCopiedBadgeId] = useState<string | null>(null);

  async function copyBadgeToken(participantId: string, token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedBadgeId(participantId);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the code
      // stays visible and selectable, so the leader can copy it by hand.
      setCopiedBadgeId(null);
    }
  }

  function focusErrorSummary() {
    window.setTimeout(() => summaryRef.current?.focus(), 0);
  }

  function addTeammate() {
    if (teammates.length >= MAX_TEAMMATES) return;
    const key = nextRowKeyRef.current++;
    setTeammates((prev) => [...prev, emptyRow(key)]);
  }

  function removeTeammate(rowKey: number) {
    if (teammates.length <= MIN_TEAMMATES) return;
    setTeammates((prev) => prev.filter((item) => item.rowKey !== rowKey));
    setErrors((prev) => {
      const nextTeammates = { ...prev.teammates };
      delete nextTeammates[rowKey];
      return { ...prev, teammates: nextTeammates };
    });
  }

  function updateTeammate(rowKey: number, field: keyof TeamMemberInput, value: string) {
    setTeammates((prev) =>
      prev.map((item) => (item.rowKey === rowKey ? { ...item, [field]: value } : item)),
    );
    setErrors((prev) => {
      const current = prev.teammates[rowKey];
      if (!current?.[field]) return prev;
      return {
        ...prev,
        teammates: { ...prev.teammates, [rowKey]: { ...current, [field]: undefined } },
      };
    });
  }

  function clearError(field: Exclude<keyof RegistrationErrors, 'teammates'>) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setServerError(null);

    const parsed = teamRegistrationRequestSchema.safeParse({
      teamName,
      password,
      leader: { fullName: leaderName, email: leaderEmail },
      teammates: teammates.map(({ fullName, email }) => ({ fullName, email })),
    });

    const nextErrors: RegistrationErrors = { teammates: {} };
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [root, second, third] = issue.path;
        if (root === 'teamName') {
          nextErrors.teamName ??= issue.message;
        } else if (root === 'password') {
          nextErrors.password ??= issue.message;
        } else if (root === 'leader' && second === 'fullName') {
          nextErrors.leaderFullName ??= issue.message;
        } else if (root === 'leader' && second === 'email') {
          nextErrors.leaderEmail ??= issue.message;
        } else if (root === 'teammates' && typeof second === 'number') {
          const row = teammates[second];
          if (row && (third === 'fullName' || third === 'email')) {
            const rowErrors = (nextErrors.teammates[row.rowKey] ??= {});
            rowErrors[third] ??= issue.message;
          }
        } else if (root === 'teammates') {
          nextErrors.roster ??= issue.message;
        }
      }
    }

    const emails = [leaderEmail, ...teammates.map((member) => member.email)]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (new Set(emails).size !== emails.length) {
      nextErrors.roster ??= 'Every participant on the team must have a unique email address.';
    }

    if (hasErrors(nextErrors) || !parsed.success) {
      setErrors(nextErrors);
      focusErrorSummary();
      return;
    }

    setErrors(NO_ERRORS);
    setSubmitting(true);
    try {
      setCreatedTeam(await api.registrations.registerTeam(parsed.data));
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        // Field-level details (duplicate email, taken team name, …) land on
        // the matching input; the server message stays in the summary.
        setErrors(serverFieldErrors(error.details, teammates));
        setServerError(error.message);
      } else {
        setServerError('Unable to complete registration. Please try again.');
      }
      focusErrorSummary();
    } finally {
      setSubmitting(false);
    }
  }

  if (createdTeam) {
    const hasBadges = createdTeam.badges.length > 0;
    return (
      <div className={styles.shell}>
        <div className={styles.page}>
          <section className={styles.card} aria-live="polite">
            <h1 className={styles.doneTitle}>Team &quot;{createdTeam.teamName}&quot; registered</h1>
            <p className={styles.lede}>{createdTeam.participantCount} participants recorded.</p>

            {hasBadges ? (
              <>
                <div className={styles.badgeNotice} role="note">
                  <strong>Each participant has been emailed their own QR badge.</strong>
                  <p>
                    You can also sign in with the team account at any time to show every
                    member&apos;s QR code on a phone at the entrance, or resend an email. Treat each
                    code like a password.
                  </p>
                </div>
                <ul className={styles.doneList} aria-label="Participant badge codes">
                  {createdTeam.badges.map((badge) => (
                    <li key={badge.participantId} className={styles.badgeRow}>
                      <b>{badge.participantName}</b>
                      <code className={styles.badgeToken}>{badge.token}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Copy badge code for ${badge.participantName}`}
                        onClick={() => void copyBadgeToken(badge.participantId, badge.token)}
                      >
                        {copiedBadgeId === badge.participantId ? 'Copied' : 'Copy'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className={styles.lede}>{createdTeam.message}</p>
                <ul className={styles.doneList}>
                  <li>
                    <b>{leaderName} (leader)</b>
                    <span>{leaderEmail}</span>
                  </li>
                  {teammates.map((member) => (
                    <li key={member.rowKey}>
                      <b>{member.fullName}</b>
                      <span>{member.email}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Link href="/login" className={buttonClassName({ variant: 'primary', size: 'md' })}>
              Go to sign in
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const summaryItems: Array<{ href: string; text: string }> = [];
  if (errors.teamName) summaryItems.push({ href: '#reg-team-name', text: errors.teamName });
  if (errors.password) summaryItems.push({ href: '#reg-password', text: errors.password });
  if (errors.leaderFullName)
    summaryItems.push({ href: '#reg-leader-name', text: errors.leaderFullName });
  if (errors.leaderEmail)
    summaryItems.push({ href: '#reg-leader-email', text: errors.leaderEmail });
  if (errors.roster) summaryItems.push({ href: '#reg-teammates', text: errors.roster });
  teammates.forEach((member, index) => {
    const rowErrors = errors.teammates[member.rowKey];
    if (rowErrors?.fullName) {
      summaryItems.push({
        href: `#reg-member-name-${member.rowKey}`,
        text: `Teammate ${index + 1}: ${rowErrors.fullName}`,
      });
    }
    if (rowErrors?.email) {
      summaryItems.push({
        href: `#reg-member-email-${member.rowKey}`,
        text: `Teammate ${index + 1}: ${rowErrors.email}`,
      });
    }
  });

  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Register your team</h1>
        <p className={styles.lede}>
          Teams have {TEAM_MEMBERS_TOTAL_MIN} to {TEAM_MEMBERS_TOTAL_MAX} people: you (the leader)
          plus {MIN_TEAMMATES} to {MAX_TEAMMATES} teammates. The organizers assign your challenge
          track before launch.
        </p>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className={`${styles.card} ${styles.form}`}
        >
          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Team</legend>
            <div className={styles.memberGrid}>
              <FormField
                id="reg-team-name"
                label="Team name"
                hint="3 to 60 characters."
                required
                error={errors.teamName}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    name="teamName"
                    type="text"
                    maxLength={60}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    value={teamName}
                    onChange={(event) => {
                      setTeamName(event.target.value);
                      clearError('teamName');
                    }}
                  />
                )}
              </FormField>

              <FormField
                id="reg-password"
                label="Team account password"
                hint="At least 12 characters. Used to sign in on event night."
                required
                error={errors.password}
              >
                {({ id, describedBy, invalid }) => (
                  <div className={styles.passwordRow}>
                    <TextInput
                      id={id}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={12}
                      required
                      invalid={invalid}
                      aria-describedby={describedBy}
                      className={styles.passwordInput}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearError('password');
                      }}
                    />
                    <Button
                      variant="outline"
                      size="md"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                )}
              </FormField>
            </div>
          </fieldset>

          <fieldset className={styles.section}>
            <legend className={styles.sectionTitle}>Team leader</legend>
            <div className={styles.memberGrid}>
              <FormField
                id="reg-leader-name"
                label="Leader full name"
                required
                error={errors.leaderFullName}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    name="leaderFullName"
                    type="text"
                    autoComplete="name"
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    value={leaderName}
                    onChange={(event) => {
                      setLeaderName(event.target.value);
                      clearError('leaderFullName');
                    }}
                  />
                )}
              </FormField>

              <FormField
                id="reg-leader-email"
                label="Leader email"
                hint="Used to sign in."
                required
                error={errors.leaderEmail}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    name="leaderEmail"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    value={leaderEmail}
                    onChange={(event) => {
                      setLeaderEmail(event.target.value);
                      clearError('leaderEmail');
                    }}
                  />
                )}
              </FormField>
            </div>
          </fieldset>

          <fieldset className={styles.section} id="reg-teammates">
            <legend className={styles.sectionTitle}>Teammates</legend>
            <p className={styles.rosterCount}>
              Total team size: <strong>{1 + teammates.length}</strong> / {TEAM_MEMBERS_TOTAL_MAX}{' '}
              participants
            </p>

            {teammates.map((member, index) => {
              const rowErrors = errors.teammates[member.rowKey];
              return (
                <div key={member.rowKey} className={styles.memberRow}>
                  <FormField
                    id={`reg-member-name-${member.rowKey}`}
                    label={`Teammate ${index + 1} full name`}
                    required
                    error={rowErrors?.fullName}
                  >
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        name={`teammates[${index}].fullName`}
                        type="text"
                        required
                        invalid={invalid}
                        aria-describedby={describedBy}
                        value={member.fullName}
                        onChange={(event) =>
                          updateTeammate(member.rowKey, 'fullName', event.target.value)
                        }
                      />
                    )}
                  </FormField>

                  <FormField
                    id={`reg-member-email-${member.rowKey}`}
                    label={`Teammate ${index + 1} email`}
                    required
                    error={rowErrors?.email}
                  >
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        name={`teammates[${index}].email`}
                        type="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        invalid={invalid}
                        aria-describedby={describedBy}
                        value={member.email}
                        onChange={(event) =>
                          updateTeammate(member.rowKey, 'email', event.target.value)
                        }
                      />
                    )}
                  </FormField>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.removeButton}
                    disabled={teammates.length <= MIN_TEAMMATES}
                    aria-label={`Remove teammate ${index + 1}`}
                    onClick={() => removeTeammate(member.rowKey)}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              disabled={teammates.length >= MAX_TEAMMATES}
              onClick={addTeammate}
            >
              Add teammate
            </Button>
          </fieldset>

          {(summaryItems.length > 0 || serverError) && (
            <div
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
              aria-labelledby="reg-error-summary-title"
              className={styles.errorSummary}
            >
              <p id="reg-error-summary-title" className={styles.errorSummaryTitle}>
                Please review the registration form
              </p>
              {serverError ? <p>{serverError}</p> : null}
              {summaryItems.length > 0 ? (
                <ul className={styles.errorList}>
                  {summaryItems.map((item) => (
                    <li key={`${item.href}-${item.text}`}>
                      <a href={item.href}>{item.text}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <div className={styles.foot}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnRed}`}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className={styles.spin} aria-hidden="true" />
                  Submitting registration…
                </>
              ) : (
                'Register team'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
