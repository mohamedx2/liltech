import Link from 'next/link';
import { brandConfig } from '@/config/brand';
import styles from './brand-mark.module.css';

export interface BrandMarkProps {
  href?: string;
}

/**
 * Reusable brand identity component.
 * Renders official logo assets from `brandConfig.logos` once available,
 * and falls back to a clean text wordmark in the meantime.
 */
export function BrandMark({ href = '/' }: BrandMarkProps) {
  const { logos, shortName, productName } = brandConfig;

  const content =
    logos.light && logos.dark ? (
      <>
        <img
          src={logos.light}
          alt={logos.alt}
          width={logos.width}
          height={logos.height}
          className={`${styles.logoImage} ${styles.logoLight}`}
        />
        <img
          src={logos.dark}
          alt={logos.alt}
          width={logos.width}
          height={logos.height}
          className={`${styles.logoImage} ${styles.logoDark}`}
        />
      </>
    ) : logos.default ? (
      <img
        src={logos.default}
        alt={logos.alt}
        width={logos.width}
        height={logos.height}
        className={styles.logoImage}
      />
    ) : (
      <span className={styles.wordmark} aria-label={productName}>
        <span>{shortName}</span>
        <span className={styles.yearTag}>2026</span>
      </span>
    );

  return (
    <Link href={href} className={styles.brandLink}>
      {content}
    </Link>
  );
}
