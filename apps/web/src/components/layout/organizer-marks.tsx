import { brandConfig } from '@/config/brand';
import styles from './organizer-marks.module.css';

export interface OrganizerMarksProps {
  readonly variant?: 'compact' | 'auth' | 'footer';
}

/**
 * Organizer artwork sits directly on the black page: plain `<img>` elements,
 * no wrapper background, border, padding, radius, shadow or filter.
 */
export function OrganizerMarks({ variant = 'footer' }: OrganizerMarksProps) {
  return (
    <div className={`${styles.marks} ${styles[variant]}`} aria-label="Event organizers">
      <span className={styles.label}>Organized by</span>
      <ul className={styles.logoList}>
        {brandConfig.organizerLogos.map((logo) => (
          <li key={logo.src} className={styles.logoItem}>
            <img
              src={logo.src}
              alt={logo.alt}
              width={logo.width}
              height={logo.height}
              className={styles.logo}
            />
            {logo.label ? <span className={styles.logoText}>{logo.label}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
