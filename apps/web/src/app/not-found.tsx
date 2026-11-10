import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback/state-panel';
import { PageContainer } from '@/components/layout/page-container';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/navigation/site-header';
import { buttonClassName } from '@/components/ui/button';
import styles from './boundary.module.css';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

export default function NotFound() {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main id="main-content" className={styles.main}>
        <PageContainer narrow>
          <h1 className={styles.heading}>Page not found</h1>
          <EmptyState
            title="We could not find that LilTech page"
            message="The URL may have moved or belongs to a workspace still under development. Use one of the navigation links below to continue."
            action={
              <>
                <Link href="/" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
                  Back to overview
                </Link>
                <Link
                  href="/schedule"
                  className={buttonClassName({ variant: 'outline', size: 'sm' })}
                >
                  View schedule
                </Link>
                <Link href="/login" className={buttonClassName({ variant: 'outline', size: 'sm' })}>
                  Sign in
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
