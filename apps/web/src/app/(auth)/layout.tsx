import type { ReactNode } from 'react';
import { PageContainer } from '@/components/layout/page-container';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/navigation/site-header';
import styles from './auth.module.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main id="main-content" className={styles.main}>
        <PageContainer narrow>
          <div className={styles.content}>{children}</div>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
