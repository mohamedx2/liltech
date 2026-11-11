'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Alert } from '@/components/feedback/alert';
import { SuccessState } from '@/components/feedback/state-panel';
import { Button, buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const MIN_TEAMMATES = 2; // + 1 leader = 3 participants minimum
const MAX_TEAMMATES = 4; // + 1 leader = 5 participants maximum

export function TeamRegistrationForm() {
  const nextRowKeyRef = useRef(3);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [leaderName, setLeaderName] = useState('');
  const [leaderEmail, setLeaderEmail] = useState('');
  const [teammates, setTeammates] = useState<MemberRow[]>([
    { rowKey: 1, fullName: '', email: '' },
    { rowKey: 2, fullName: '', email: '' },
  ]);

  const [errors, setErrors] = useState<RegistrationErrors>({ teammates: {} });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<TeamRegistrationResponse | null>(null);

  function focusErrorSummary() {
    window.setTimeout(() => {
      summaryRef.current?.focus();
    }, 0);
  }

  function addTeammate() {
    if (teammates.length >= MAX_TEAMMATES) return;
    const key = nextRowKeyRef.current++;
    setTeammates((prev) => [...prev, { rowKey: key, fullName: '', email: '' }]);
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
        teammates: {
          ...prev.teammates,
          [rowKey]: { ...current, [field]: undefined },
        },
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setServerError(null);

    const payload = {
      teamName,
      password,
      leader: { fullName: leaderName, email: leaderEmail },
      teammates: teammates.map(({ fullName, email }) => ({ fullName, email })),
    };

    const parsed = teamRegistrationRequestSchema.safeParse(payload);
    const nextErrors: RegistrationErrors = { teammates: {} };

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [root, second, third] = issue.path;
        if (root === 'teamName' && !nextErrors.teamName) {
          nextErrors.teamName = issue.message;
        } else if (root === 'password' && !nextErrors.password) {
          nextErrors.password = issue.message;
        } else if (root === 'leader' && second === 'fullName' && !nextErrors.leaderFullName) {
          nextErrors.leaderFullName = issue.message;
        } else if (root === 'leader' && second === 'email' && !nextErrors.leaderEmail) {
          nextErrors.leaderEmail = issue.message;
        } else if (root === 'teammates' && typeof second === 'number') {
          const row = teammates[second];
          if (row && (third === 'fullName' || third === 'email')) {
            const prevRowErr = nextErrors.teammates[row.rowKey] ?? {};
            if (!prevRowErr[third]) {
              nextErrors.teammates[row.rowKey] = { ...prevRowErr, [third]: issue.message };
            }
          }
        } else if (root === 'teammates' && !nextErrors.roster) {
          nextErrors.roster = issue.message;
        }
      }
    }

    // Check email uniqueness across leader and teammates
    const normalizedEmails = [
      leaderEmail.trim().toLowerCase(),
      ...teammates.map((member) => member.email.trim().toLowerCase()),
    ].filter(Boolean);
    if (new Set(normalizedEmails).size !== normalizedEmails.length && !nextErrors.roster) {
      nextErrors.roster = 'Every participant on the team must have a unique email address.';
    }

    const hasTeammateErrors = Object.values(nextErrors.teammates).some(
      (entry) => Boolean(entry.fullName) || Boolean(entry.email),
    );
    if (
      nextErrors.teamName ||
      nextErrors.password ||
      nextErrors.leaderFullName ||
      nextErrors.leaderEmail ||
      nextErrors.roster ||
      hasTeammateErrors
    ) {
      setErrors(nextErrors);
      focusErrorSummary();
      return;
    }

    if (!parsed.success) return;

    setErrors({ teammates: {} });
    setSubmitting(true);

    try {
      const response = await api.registrations.registerTeam(parsed.data);
      setCreatedTeam(response);
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        if (error.status === 404 || error.status === 501) {
          setServerError(
            'Team registration endpoint is not deployed on the backend yet. Switch NEXT_PUBLIC_API_MODE=mock to test registration locally.',
          );
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('Unable to complete registration. Please try again.');
      }
      focusErrorSummary();
    } finally {
      setSubmitting(false);
    }
  }

  if (createdTeam) {
    return (
      <SuccessState
        title={`Team "${createdTeam.teamName}" registered`}
        message={`${createdTeam.participantCount} participants recorded (status: ${createdTeam.status}). ${createdTeam.message}`}
        action={
          <>
            <Link href="/login" className={buttonClassName({ variant: 'primary', size: 'md' })}>
              Sign in as team
            </Link>
            <Link href="/" className={buttonClassName({ variant: 'outline', size: 'md' })}>
              Back to overview
            </Link>
          </>
        }
      />
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
    const rowErr = errors.teammates[member.rowKey];
    if (rowErr?.fullName) {
      summaryItems.push({
        href: `#reg-member-name-${member.rowKey}`,
        text: `Teammate ${index + 1}: ${rowErr.fullName}`,
      });
    }
    if (rowErr?.email) {
      summaryItems.push({
        href: `#reg-member-email-${member.rowKey}`,
        text: `Teammate ${index + 1}: ${rowErr.email}`,
      });
    }
  });

  const totalParticipants = 1 + teammates.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Register your LilTech 2026 team</CardTitle>
        <CardDescription>
          Each team consists of 3–5 participants (1 team leader + 2–4 teammates). Personal QR
          check-in badges are delivered by email once confirmed by the platform.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Alert tone="info" title="Challenge track assignment">
          Challenge track assignment rules are confirmed by the organizers prior to launch — teams
          do not select a track during registration.
        </Alert>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate className={styles.form}>
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

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Team account</legend>

            <FormField
              id="reg-team-name"
              label="Team name"
              hint="2 to 80 characters. Visible on check-in lists and scoreboards."
              required
              error={errors.teamName}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="teamName"
                  type="text"
                  maxLength={80}
                  required
                  invalid={invalid}
                  aria-describedby={describedBy}
                  value={teamName}
                  onChange={(event) => {
                    setTeamName(event.target.value);
                    if (errors.teamName) setErrors((prev) => ({ ...prev, teamName: undefined }));
                  }}
                />
              )}
            </FormField>

            <FormField
              id="reg-password"
              label="Team account password"
              hint="At least 8 characters. Used by the team to sign in on event night."
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
                    minLength={8}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    className={styles.passwordInput}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
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
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Team leader (Participant 1)</legend>
            <div className={styles.memberGrid}>
              <FormField
                id="reg-leader-name"
                label="Full name"
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
                      if (errors.leaderFullName) {
                        setErrors((prev) => ({ ...prev, leaderFullName: undefined }));
                      }
                    }}
                  />
                )}
              </FormField>

              <FormField
                id="reg-leader-email"
                label="Email address"
                hint="Used to sign in and receive the leader QR badge."
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
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    value={leaderEmail}
                    onChange={(event) => {
                      setLeaderEmail(event.target.value);
                      if (errors.leaderEmail) {
                        setErrors((prev) => ({ ...prev, leaderEmail: undefined }));
                      }
                    }}
                  />
                )}
              </FormField>
            </div>
          </fieldset>

          <fieldset id="reg-teammates" className={styles.fieldset}>
            <legend className={styles.legend}>Teammates (2 to 4 participants)</legend>

            <div className={styles.rosterToolbar}>
              <span className={styles.rosterCount}>
                Total team size: <strong>{totalParticipants}</strong> / 5 participants
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={teammates.length >= MAX_TEAMMATES}
                onClick={addTeammate}
              >
                Add teammate
              </Button>
            </div>

            {teammates.map((member, index) => {
              const rowErr = errors.teammates[member.rowKey];
              const participantNumber = index + 2;
              return (
                <div key={member.rowKey} className={styles.memberCard}>
                  <div className={styles.memberHeader}>
                    <span className={styles.memberTitle}>
                      Teammate {index + 1} (Participant {participantNumber})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={teammates.length <= MIN_TEAMMATES}
                      aria-label={`Remove teammate ${index + 1}`}
                      onClick={() => removeTeammate(member.rowKey)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className={styles.memberGrid}>
                    <FormField
                      id={`reg-member-name-${member.rowKey}`}
                      label={`Teammate ${index + 1} full name`}
                      required
                      error={rowErr?.fullName}
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
                      error={rowErr?.email}
                    >
                      {({ id, describedBy, invalid }) => (
                        <TextInput
                          id={id}
                          name={`teammates[${index}].email`}
                          type="email"
                          autoCapitalize="none"
                          autoCorrect="off"
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
                  </div>
                </div>
              );
            })}
          </fieldset>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            loadingLabel="Submitting registration…"
          >
            Submit team registration
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
