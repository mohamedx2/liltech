'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
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

const MIN_TEAMMATES = 2; // + 1 leader = 3 participants minimum
const MAX_TEAMMATES = 4; // + 1 leader = 5 participants maximum

const STEPS = [
  {
    id: 'team',
    name: 'Team',
    sub: 'Name and password',
    title: 'Name your team',
    lede: 'Pick the name and password your team uses on event night.',
  },
  {
    id: 'leader',
    name: 'Leader',
    sub: 'Participant 1',
    title: 'Team leader',
    lede: 'The leader registers the team and receives the first badge.',
  },
  {
    id: 'teammates',
    name: 'Teammates',
    sub: '2 to 4 people',
    title: 'Add your teammates',
    lede: 'A team has 3 to 5 people: the leader plus 2 to 4 teammates.',
  },
  {
    id: 'confirm',
    name: 'Confirm',
    sub: 'Send the badges',
    title: 'Check and confirm',
    lede: 'Review everything. You can still go back and edit.',
  },
] as const;

const LAST_STEP = STEPS.length - 1;

export function TeamRegistrationForm() {
  const nextRowKeyRef = useRef(3);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

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

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [confirmed, setConfirmed] = useState(false);

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

  /**
   * Step gate: runs the app's own schema and keeps only the issues that belong to
   * the step being left, so "Continue" never submits or bypasses validation.
   */
  function validateStep(target: number) {
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
        if (root === 'teamName' && target === 0 && !nextErrors.teamName) {
          nextErrors.teamName = issue.message;
        } else if (root === 'password' && target === 0 && !nextErrors.password) {
          nextErrors.password = issue.message;
        } else if (
          root === 'leader' &&
          target === 1 &&
          second === 'fullName' &&
          !nextErrors.leaderFullName
        ) {
          nextErrors.leaderFullName = issue.message;
        } else if (
          root === 'leader' &&
          target === 1 &&
          second === 'email' &&
          !nextErrors.leaderEmail
        ) {
          nextErrors.leaderEmail = issue.message;
        } else if (root === 'teammates' && target === 2 && typeof second === 'number') {
          const row = teammates[second];
          if (row && (third === 'fullName' || third === 'email')) {
            const prevRowErr = nextErrors.teammates[row.rowKey] ?? {};
            if (!prevRowErr[third]) {
              nextErrors.teammates[row.rowKey] = { ...prevRowErr, [third]: issue.message };
            }
          }
        } else if (root === 'teammates' && target === 2 && !nextErrors.roster) {
          nextErrors.roster = issue.message;
        }
      }
    }

    if (target === 2) {
      const normalizedEmails = [
        leaderEmail.trim().toLowerCase(),
        ...teammates.map((member) => member.email.trim().toLowerCase()),
      ].filter(Boolean);
      if (new Set(normalizedEmails).size !== normalizedEmails.length && !nextErrors.roster) {
        nextErrors.roster = 'Every participant on the team must have a unique email address.';
      }
    }

    const hasTeammateErrors = Object.values(nextErrors.teammates).some(
      (entry) => Boolean(entry.fullName) || Boolean(entry.email),
    );
    setErrors(nextErrors);
    return !(
      nextErrors.teamName ||
      nextErrors.password ||
      nextErrors.leaderFullName ||
      nextErrors.leaderEmail ||
      nextErrors.roster ||
      hasTeammateErrors
    );
  }

  function goTo(target: number, nextDirection: 1 | -1) {
    setDirection(nextDirection);
    setServerError(null);
    setStep(target);
    window.setTimeout(() => {
      titleRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  }

  function handleContinue() {
    if (step >= LAST_STEP) return;
    if (!validateStep(step)) {
      window.setTimeout(() => {
        cardRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
      return;
    }
    goTo(step + 1, 1);
  }

  function handleCardPointer(event: ReactPointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - bounds.top}px`);
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
  const passwordScore =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) && /\d/.test(password) ? 1 : 0) +
    (password.length >= 12 && /[^A-Za-z0-9]/.test(password) ? 1 : 0);

  const stepper = (active: number) => (
    <ol className={styles.steps}>
      {STEPS.map((item, index) => {
        const state = index < active ? styles.done : index === active ? styles.now : styles.next;
        return (
          <li
            key={item.id}
            className={`${styles.step} ${state}`}
            aria-current={index === active ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {index < active ? '✓' : index + 1}
            </span>
            <span className={styles.stepText}>
              <b>{item.name}</b>
              <span className={styles.stepSub}>{item.sub}</span>
            </span>
            <i className={styles.connector} aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );

  if (createdTeam) {
    return (
      <div className={styles.shell}>
        <div className={styles.grid}>
          <aside className={styles.side}>
            <h1 className={styles.pageTitle}>Register your team</h1>
            <p className={styles.pageLede}>
              Four short steps. Your badges arrive by email as soon as you confirm.
            </p>
            {stepper(STEPS.length)}
          </aside>

          <section className={styles.glass} ref={cardRef} aria-live="polite">
            <div className={styles.doneWrap}>
              <svg
                className={styles.doneCheck}
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                stroke="#4ADE80"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="32" cy="32" r="28" strokeOpacity={0.35} />
                <path d="M19 33l9 9 17-19" />
              </svg>
              <h2 className={styles.doneTitle}>
                Team &quot;{createdTeam.teamName}&quot; registered
              </h2>
              <p className={styles.doneLede}>
                {createdTeam.participantCount} participants recorded (status: {createdTeam.status}).
                Badges are on their way — the organizers confirm your track before launch.
              </p>
              <ul className={styles.doneList}>
                <li>
                  <b>{leaderName || 'Team leader'} (leader)</b>
                  <span>Badge sent to {leaderEmail}</span>
                </li>
                {teammates.map((member, index) => (
                  <li key={member.rowKey}>
                    <b>{member.fullName || `Teammate ${index + 1}`}</b>
                    <span>Badge sent to {member.email}</span>
                  </li>
                ))}
              </ul>
              <Link href="/login" className={buttonClassName({ variant: 'primary', size: 'md' })}>
                Go to sign in
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const meta = STEPS[step];

  return (
    <div className={styles.shell}>
      <div className={styles.grid}>
        <aside className={styles.side}>
          <h1 className={styles.pageTitle}>Register your team</h1>
          <p className={styles.pageLede}>
            Four short steps. Your badges arrive by email as soon as you confirm.
          </p>
          {stepper(step)}
        </aside>

        <section
          className={styles.glass}
          ref={cardRef}
          aria-live="polite"
          onPointerMove={handleCardPointer}
        >
          <div className={styles.head}>
            <h2 id="reg-step-title" className={styles.cardTitle} ref={titleRef} tabIndex={-1}>
              {meta.title}
            </h2>
            <p className={styles.cardLede}>{meta.lede}</p>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} noValidate className={styles.form}>
            <div
              key={meta.id}
              className={direction < 0 ? `${styles.pane} ${styles.paneBack}` : styles.pane}
            >
              {step === 0 ? (
                <>
                  <div className={styles.note}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16v.01" />
                    </svg>
                    <span>
                      The organizers assign your challenge track before launch. You don’t choose one
                      here.
                    </span>
                  </div>

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
                        placeholder="Team Alpha"
                        value={teamName}
                        onChange={(event) => {
                          setTeamName(event.target.value);
                          if (errors.teamName)
                            setErrors((prev) => ({ ...prev, teamName: undefined }));
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
                      <>
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
                              if (errors.password)
                                setErrors((prev) => ({ ...prev, password: undefined }));
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
                        <div className={styles.meter} aria-hidden="true">
                          {[0, 1, 2].map((bar) => (
                            <span
                              key={bar}
                              className={bar < passwordScore ? styles.meterOn : styles.meterBar}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </FormField>
                </>
              ) : null}

              {step === 1 ? (
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
              ) : null}

              {step === 2 ? (
                <div id="reg-teammates">
                  <div className={styles.rosterToolbar}>
                    <span className={styles.rosterCount}>
                      Total team size: <strong>{totalParticipants}</strong> / 5 participants
                    </span>
                    <Button
                      variant="ghost"
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
                      <div key={member.rowKey} className={styles.member}>
                        <div className={styles.memberHeader}>
                          <b className={styles.memberTitle}>
                            Teammate {index + 1} (Participant {participantNumber})
                          </b>
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
                </div>
              ) : null}

              {step === 3 ? (
                <div className={styles.review}>
                  <div className={styles.sum}>
                    <h3>{teamName.trim() ? `Team: ${teamName.trim()}` : 'Team: not named yet'}</h3>
                    <button type="button" className={styles.editLink} onClick={() => goTo(0, -1)}>
                      Edit
                    </button>
                    <p>Password set ({password.length} characters)</p>
                  </div>

                  <div className={styles.sum}>
                    <h3>
                      {leaderName.trim()
                        ? `Team leader: ${leaderName.trim()}`
                        : 'Team leader: not named yet'}
                    </h3>
                    <button type="button" className={styles.editLink} onClick={() => goTo(1, -1)}>
                      Edit
                    </button>
                    <p>{leaderEmail.trim() || 'No email yet'}</p>
                  </div>

                  {teammates.map((member, index) => (
                    <div key={member.rowKey} className={styles.sum}>
                      <h3>
                        {member.fullName.trim()
                          ? `Teammate ${index + 1}: ${member.fullName.trim()}`
                          : `Teammate ${index + 1}: not named yet`}
                      </h3>
                      <button type="button" className={styles.editLink} onClick={() => goTo(2, -1)}>
                        Edit
                      </button>
                      <p>{member.email.trim() || 'No email yet'}</p>
                    </div>
                  ))}

                  <label className={styles.chk}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      I confirm these details are correct and each person agrees to receive a badge
                      by email.
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

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
                type="button"
                className={`${styles.btn} ${step === 0 ? styles.btnHidden : ''}`}
                onClick={() => goTo(step - 1, -1)}
              >
                Back
              </button>

              {step < LAST_STEP ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnRed}`}
                  onClick={handleContinue}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnRed}`}
                  disabled={!confirmed || submitting}
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
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
