import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/navigation/site-header';
import styles from './public.module.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
