import Link from 'next/link';
import { brandConfig } from '@/config/brand';
import { ThemeToggle } from '../ui/theme-toggle';
import { PageContainer } from './page-container';
import styles from './site-footer.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <PageContainer>
        <div className={styles.inner}>
          <div className={styles.meta}>
            <p className={styles.title}>
              {brandConfig.productName} · {brandConfig.eventDates}
            </p>
            <p className={styles.subtitle}>
              Organized by {brandConfig.organizers.join(' & ')} · {brandConfig.eventLocation}
            </p>
          </div>

          <div className={styles.controls}>
            <nav aria-label="Footer">
              <ul className={styles.links}>
                <li>
                  <Link href="/schedule">Schedule</Link>
                </li>
                <li>
                  <Link href="/challenges">Tracks</Link>
                </li>
                <li>
                  <Link href="/register">Registration</Link>
                </li>
                <li>
                  <Link href="/login">Sign in</Link>
                </li>
              </ul>
            </nav>
            {brandConfig.theme.supportsColorSchemeSwitch ? <ThemeToggle /> : null}
          </div>
        </div>
      </PageContainer>
    </footer>
  );
}
