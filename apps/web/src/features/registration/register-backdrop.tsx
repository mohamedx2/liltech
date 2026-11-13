'use client';

import { useEffect } from 'react';
import { brandConfig } from '@/config/brand';
import styles from './register-backdrop.module.css';

const SWOOSH = 'M-120,760 C320,930 980,860 1340,540 S1760,90 1480,40';

export function RegisterBackdrop() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(hover: none)');
    if (reduce.matches || coarse.matches) return;

    const root = document.documentElement;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--px', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        root.style.setProperty('--py', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };

    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty('--px');
      root.style.removeProperty('--py');
    };
  }, []);

  return (
    <div className={styles.world} aria-hidden="true">
      <img
        className={styles.logo}
        src={brandConfig.logos.default ?? undefined}
        alt=""
        width={1254}
        height={1104}
      />
      <svg
        className={styles.swoosh}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="register-swoosh" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#7A0C0C" />
            <stop offset="0.5" stopColor="#FF2A1F" />
            <stop offset="1" stopColor="#EBC27A" />
          </linearGradient>
          <filter id="register-swoosh-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <g fill="none" stroke="url(#register-swoosh)" strokeLinecap="round">
          <path d={SWOOSH} strokeWidth={16} opacity={0.7} filter="url(#register-swoosh-glow)" />
          <path className={styles.line} d={SWOOSH} strokeWidth={4} />
        </g>
      </svg>
    </div>
  );
}
