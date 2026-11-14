'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, buttonClassName } from '@/components/ui/button';
import { FormField, TextInput } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api';
import { loginRequestSchema } from '@/lib/api/contracts/pending';
import { getRoleHomePath, getRoleLabel } from '@/lib/auth/route-access';
import { useAuth } from '@/lib/auth/session';
import styles from './login-form.module.css';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const { status, user, isMockMode, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const summaryRef = useRef<HTMLDivElement | null>(null);

  if (status === 'authenticated' && user) {
    const homePath = getRoleHomePath(user.role);
    return (
      <section className={styles.card}>
        <h1 className={styles.title}>Already signed in</h1>
        <p className={styles.lede}>
          Signed in as {user.name} ({getRoleLabel(user.role)}).
        </p>
        <Link href={homePath} className={buttonClassName({ variant: 'primary', size: 'lg' })}>
          Continue to {getRoleLabel(user.role)} workspace
        </Link>
      </section>
    );
  }

  function focusErrorSummary() {
    window.setTimeout(() => {
      summaryRef.current?.focus();
    }, 0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setServerError(null);
    const parsed = loginRequestSchema.safeParse({ email, password });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email' && !nextErrors.email) nextErrors.email = issue.message;
        if (key === 'password' && !nextErrors.password) nextErrors.password = issue.message;
      }
      setFieldErrors(nextErrors);
      focusErrorSummary();
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const authenticatedUser = await login(parsed.data);
      router.push(getRoleHomePath(authenticatedUser.role));
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        if (error.status === 404 || error.status === 501) {
          setServerError(
            'Sign-in endpoint is not deployed on the backend yet. Switch NEXT_PUBLIC_API_MODE=mock for UI preview.',
          );
        } else if (error.code === 'RATE_LIMITED') {
          setServerError('Too many sign-in attempts. Please wait a moment before trying again.');
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError('Unable to sign in right now. Please try again.');
      }
      focusErrorSummary();
    } finally {
      setSubmitting(false);
    }
  }

  function handleCardPointer(event: ReactPointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - bounds.top}px`);
  }

  const errorEntries = [
    fieldErrors.email ? { id: 'login-email', text: fieldErrors.email } : null,
    fieldErrors.password ? { id: 'login-password', text: fieldErrors.password } : null,
  ].filter((item): item is { id: string; text: string } => item !== null);

  return (
    <section className={styles.card} onPointerMove={handleCardPointer}>
      <h1 className={styles.title} tabIndex={-1}>
        Sign in to LilTech 2026
      </h1>
      <p className={styles.lede}>
        Access your team, jury, or organizer workspace using the credentials issued for your role.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className={styles.form}>
        {(errorEntries.length > 0 || serverError) && (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            aria-labelledby="login-error-summary-title"
            className={styles.errorSummary}
          >
            <p id="login-error-summary-title" className={styles.errorSummaryTitle}>
              There was a problem signing in
            </p>
            {serverError ? <p>{serverError}</p> : null}
            {errorEntries.length > 0 ? (
              <ul className={styles.errorList}>
                {errorEntries.map((entry) => (
                  <li key={entry.id}>
                    <a href={`#${entry.id}`}>{entry.text}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <FormField id="login-email" label="Email address" required error={fieldErrors.email}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              invalid={invalid}
              aria-describedby={describedBy}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
            />
          )}
        </FormField>

        <FormField id="login-password" label="Password" required error={fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <div className={styles.passwordRow}>
              <TextInput
                id={id}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="done"
                required
                invalid={invalid}
                aria-describedby={describedBy}
                className={styles.passwordInput}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
              />
              <Button
                variant="outline"
                size="md"
                className={styles.toggle}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}
        </FormField>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          className={styles.submit}
          loading={submitting}
          loadingLabel="Signing in…"
        >
          Sign in
        </Button>
      </form>

      <div className={styles.prompt}>
        <p className={styles.promptText}>New team for LilTech 2026?</p>
        <Link href="/register" className={styles.promptLink}>
          Register a 4–7 member team
        </Link>
      </div>

      {isMockMode ? (
        <div className={styles.mockBox} aria-label="Development mock mode accounts">
          <p className={styles.mockHeading}>Development Mock Mode Only</p>
          <p className={styles.mockNote}>
            Backend authentication is mocked locally. Pre-fill a sample role to test UI flows (never
            present in production mode):
          </p>
          <div className={styles.mockButtons}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEmail('team@liltech.mock');
                setPassword('dev-mock-pass');
              }}
            >
              Use Mock Team
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEmail('jury@liltech.mock');
                setPassword('dev-mock-pass');
              }}
            >
              Use Mock Jury
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEmail('admin@liltech.mock');
                setPassword('dev-mock-pass');
              }}
            >
              Use Mock Admin
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
