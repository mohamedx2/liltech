import Link from 'next/link';
import { brandConfig } from '@/config/brand';
import styles from './site-footer.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            {brandConfig.logos.default ? (
              <img
                className={styles.brandLogo}
                src={brandConfig.logos.default}
                alt={brandConfig.logos.alt}
                width={brandConfig.logos.width}
                height={brandConfig.logos.height}
              />
            ) : null}
            <p className={styles.brandName}>{brandConfig.productName}</p>
            <p className={styles.brandMeta}>
              {brandConfig.eventDates} · {brandConfig.eventLocation}
            </p>
          </div>

          <nav className={styles.nav} aria-label="Footer">
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
        </div>

        <div className={styles.organizers}>
          <p className={styles.organizersLabel}>Organized by</p>
          <div className={styles.logoRow}>
            {brandConfig.organizerLogos.map((logo) => (
              <div key={logo.src} className={styles.logoItem}>
                <img
                  className={styles.organizerLogo}
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.width}
                  height={logo.height}
                />
                {logo.label ? <span className={styles.organizerName}>{logo.label}</span> : null}
              </div>
            ))}
          </div>
        </div>

        <p className={styles.bottomLine}>Organized by {brandConfig.organizers.join(' and ')}</p>
      </div>
    </footer>
  );
}
