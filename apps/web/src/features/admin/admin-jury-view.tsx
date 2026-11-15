'use client';

import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminJuryAccount } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { ErrorState, EmptyState, LoadingState } from '@/components/feedback/state-panel';
import { Alert } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, TextInput } from '@/components/ui/input';
import { DataTable } from '@/components/ui/table';
import styles from './admin-jury-view.module.css';

const PASSWORD_MIN = 12;

interface JuryForm {
  name: string;
  email: string;
  password: string;
}

type FieldErrors = Partial<Record<keyof JuryForm, string>>;

const EMPTY_FORM: JuryForm = { name: '', email: '', password: '' };

/** Maps API field details (`{ path: 'email', message }`) onto the form. */
function serverFieldErrors(error: ApiClientError): FieldErrors {
  const errors: FieldErrors = {};
  if (!Array.isArray(error.details)) return errors;
  for (const detail of error.details) {
    const { path, message } = (detail ?? {}) as { path?: unknown; message?: unknown };
    if (
      (path === 'name' || path === 'email' || path === 'password') &&
      typeof message === 'string'
    ) {
      errors[path] ??= message;
    }
  }
  return errors;
}

function PasswordCell({ password }: { password: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!password) {
    return <span className={styles.muted}>Not stored, set a new one</span>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setVisible(true);
    }
  };

  return (
    <span className={styles.passwordCell}>
      <code className={styles.password}>{visible ? password : '••••••••••••'}</code>
      <Button type="button" variant="ghost" size="sm" onClick={() => setVisible((v) => !v)}>
        {visible ? 'Hide' : 'Show'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}

/**
 * Jury account management for administrators: create, edit (name, email,
 * password) and delete. Passwords are readable here by organizer decision so
 * admins can hand them to jury members; every change is audited server-side.
 */
export function AdminJuryView() {
  const [accounts, setAccounts] = useState<AdminJuryAccount[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminJuryAccount | 'new' | null>(null);
  const [form, setForm] = useState<JuryForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleting, setDeleting] = useState<AdminJuryAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const jury = await api.admin.getJuryAccounts();
      setAccounts(jury.items);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.message : 'Failed to load jury accounts.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  };

  const openEdit = (account: AdminJuryAccount) => {
    setEditing(account);
    setForm({ name: account.name, email: account.email, password: '' });
    setFieldErrors({});
    setFormError(null);
  };

  const closeForm = () => {
    if (!isSaving) setEditing(null);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!editing) return;

    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = 'Enter the jury member name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (form.password && form.password.length < PASSWORD_MIN) {
      errors.password = `Use at least ${PASSWORD_MIN} characters, or leave it empty.`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') {
        const created = await api.admin.createJuryAccount({
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.password ? { password: form.password } : {}),
        });
        setSuccessMessage(`Jury account created for ${created.name}.`);
      } else {
        const changes = {
          ...(form.name.trim() !== editing.name ? { name: form.name.trim() } : {}),
          ...(form.email.trim().toLowerCase() !== editing.email
            ? { email: form.email.trim() }
            : {}),
          ...(form.password ? { password: form.password } : {}),
        };
        if (Object.keys(changes).length === 0) {
          setEditing(null);
          return;
        }
        const updated = await api.admin.updateJuryAccount(editing.id, changes);
        setSuccessMessage(
          changes.password
            ? `${updated.name} updated. Their old password no longer works and they were signed out.`
            : `${updated.name} updated.`,
        );
      }
      setEditing(null);
      await loadData();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(serverFieldErrors(err));
        setFormError(err.message);
      } else {
        setFormError('Could not save the jury account.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await api.admin.deleteJuryAccount(deleting.id);
      setSuccessMessage(`${deleting.name}'s jury account was deleted.`);
      setDeleting(null);
      await loadData();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiClientError ? err.message : 'Could not delete the account.',
      );
      setDeleting(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && accounts === null) {
    return <LoadingState message="Loading jury accounts..." />;
  }

  if (errorMessage && accounts === null) {
    return <ErrorState title="Jury Roster Unavailable" message={errorMessage} onRetry={loadData} />;
  }

  const isNew = editing === 'new';

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="jury-title">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Evaluation Staff</span>
          <Button type="button" variant="primary" size="sm" onClick={openCreate}>
            Add jury member
          </Button>
        </div>
        <h1 id="jury-title" className={styles.title}>
          Jury
        </h1>
        <p className={styles.description}>
          Create jury accounts and hand each member their email and password. Passwords are visible
          to administrators only. Every change is recorded in the audit log.
        </p>
      </section>

      {successMessage ? (
        <Alert tone="success" title="Done">
          {successMessage}
        </Alert>
      ) : null}
      {errorMessage && accounts !== null ? (
        <Alert tone="error" title="Action failed">
          {errorMessage}
        </Alert>
      ) : null}

      <section aria-labelledby="jury-table-heading" className={styles.panel}>
        <h2 id="jury-table-heading" className={styles.sectionTitle}>
          Jury accounts ({accounts?.length ?? 0})
        </h2>
        {accounts && accounts.length > 0 ? (
          <DataTable
            caption="Jury accounts, newest first"
            rows={accounts}
            getRowKey={(account) => account.id}
            columns={[
              { key: 'name', header: 'Name', render: (account) => account.name },
              { key: 'email', header: 'Email', render: (account) => account.email },
              {
                key: 'password',
                header: 'Password',
                render: (account) => <PasswordCell password={account.password} />,
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (account) =>
                  new Date(account.createdAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (account) => (
                  <span className={styles.actions}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(account)}
                      aria-label={`Edit ${account.name}`}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleting(account)}
                      aria-label={`Delete ${account.name}`}
                    >
                      Delete
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="No jury accounts yet"
            message="Use “Add jury member” to create the first account."
          />
        )}
      </section>

      {editing ? (
        <Dialog
          open={editing !== null}
          onClose={closeForm}
          title={isNew ? 'Add jury member' : `Edit ${editing.name}`}
          footer={
            <div className={styles.dialogFooter}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeForm}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="jury-form"
                variant="primary"
                size="sm"
                loading={isSaving}
                loadingLabel="Saving…"
              >
                {isNew ? 'Create account' : 'Save changes'}
              </Button>
            </div>
          }
        >
          <form id="jury-form" className={styles.form} onSubmit={handleSubmit} noValidate>
            {formError ? (
              <Alert tone="error" title="Could not save">
                {formError}
              </Alert>
            ) : null}
            <FormField label="Full name" required error={fieldErrors.name}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.name}
                  autoComplete="off"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Email" required error={fieldErrors.email}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="email"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.email}
                  autoComplete="off"
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              )}
            </FormField>
            <FormField
              label={isNew ? 'Password' : 'New password'}
              hint={
                isNew
                  ? 'Leave empty to generate a strong password automatically.'
                  : 'Leave empty to keep the current password. A new one signs the juror out.'
              }
              error={fieldErrors.password}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="text"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              )}
            </FormField>
          </form>
        </Dialog>
      ) : null}

      {deleting ? (
        <Dialog
          open={deleting !== null}
          onClose={() => !isDeleting && setDeleting(null)}
          title="Delete jury account"
          footer={
            <div className={styles.dialogFooter}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleting(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={isDeleting}
                loadingLabel="Deleting…"
                onClick={confirmDelete}
              >
                Delete account
              </Button>
            </div>
          }
        >
          <Alert tone="warning" title="This cannot be undone">
            {deleting.name} ({deleting.email}) will be signed out and will no longer be able to log
            in.
          </Alert>
        </Dialog>
      ) : null}
    </div>
  );
}
