import Link from 'next/link';
import { brandConfig } from '@/config/brand';
import styles from './brand-mark.module.css';

export interface BrandMarkProps {
  href?: string;
  /** `wordmark` = text brand for the nav, `logo` = official artwork on black. */
  readonly variant?: 'wordmark' | 'logo';
}

/**
 * Reusable brand identity component.
 * The dark artwork carries its own black background, so it is blended and
 * soft-masked instead of being placed inside a container.
 */
export function BrandMark({ href = '/', variant = 'wordmark' }: BrandMarkProps) {
  const { logos, shortName, productName } = brandConfig;

  const content =
    variant === 'logo' && logos.default ? (
      <img
        src={logos.default}
        alt={logos.alt}
        width={logos.width}
        height={logos.height}
        className={styles.logoImage}
      />
    ) : (
      <span className={styles.wordmark} aria-label={productName}>
        <span className={styles.wordmarkText}>{shortName}</span>
        <span className={styles.wordmarkArabic} lang="ar" dir="rtl">
          ليل
        </span>
        <span className={styles.yearTag}>2026</span>
      </span>
    );

  return (
    <Link href={href} className={styles.brandLink}>
      {content}
    </Link>
  );
}
