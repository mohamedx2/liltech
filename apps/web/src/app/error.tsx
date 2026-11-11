'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState } from '@/components/feedback/state-panel';
import { PageContainer } from '@/components/layout/page-container';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/navigation/site-header';
import { Button, buttonClassName } from '@/components/ui/button';
import styles from './boundary.module.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled interface error:', error.digest ?? error.message);
  }, [error]);

  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main id="main-content" className={styles.main}>
        <PageContainer narrow>
          <h1 className={styles.heading}>Something went wrong</h1>
          <ErrorState
            title="Unable to render this view"
            message={
              error.digest
                ? `An unexpected interface error occurred (reference: ${error.digest}).`
                : 'An unexpected interface error occurred while loading this view.'
            }
            action={
              <>
                <Button variant="primary" size="sm" onClick={() => reset()}>
                  Try again
                </Button>
                <Link href="/" className={buttonClassName({ variant: 'outline', size: 'sm' })}>
                  Back to overview
                </Link>
              </>
            }
          />
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
