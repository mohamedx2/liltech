'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { AdminJuryAccount } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { ErrorState, EmptyState, LoadingState } from '@/components/feedback/state-panel';
import { DataTable } from '@/components/ui/table';
import styles from './admin-jury-view.module.css';

/**
 * Jury account roster for administrators (read-only). Account creation and
 * challenge-track assignment are pending open questions 1 and 8 in
 * `docs/decisions/OPEN_QUESTIONS.md` and are deliberately not provided here.
 */
export function AdminJuryView() {
  const [accounts, setAccounts] = useState<AdminJuryAccount[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  if (isLoading && accounts === null) {
    return <LoadingState message="Loading jury accounts..." />;
  }

  if (errorMessage && accounts === null) {
    return <ErrorState title="Jury Roster Unavailable" message={errorMessage} onRetry={loadData} />;
  }

  return (
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="jury-title">
        <span className={styles.eyebrow}>Evaluation Staff</span>
        <h1 id="jury-title" className={styles.title}>
          Jury
        </h1>
        <p className={styles.description}>
          Jury accounts with evaluation access. Credentials are never exposed — passwords are stored
          only as bcrypt hashes.
        </p>
      </section>

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
                key: 'createdAt',
                header: 'Created',
                render: (account) =>
                  new Date(account.createdAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
              },
            ]}
          />
        ) : (
          <EmptyState
            title="No jury accounts yet"
            message="Jury accounts appear here once they are provisioned. Track assignment is pending the challenge-track decision (open question 1)."
          />
        )}
      </section>
    </div>
  );
}
