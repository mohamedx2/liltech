import styles from './icon.module.css';

/**
 * Dependency-free inline SVG icon set (Lucide-style outline, 24×24, stroke 2).
 *
 * Icons default to `aria-hidden="true"` — they are decorative and always sit
 * beside a visible text label in this codebase. If an icon ever carries
 * meaning without a text alternative, pass `title` (and drop aria-hidden)
 * instead of relying on the glyph.
 */

export type IconName =
  | 'camera'
  | 'scale'
  | 'target'
  | 'megaphone'
  | 'shield'
  | 'zap'
  | 'star'
  | 'users'
  | 'alert-triangle'
  | 'check'
  | 'refresh'
  | 'trash'
  | 'search'
  | 'award'
  | 'video'
  | 'video-off';

/** Static, hand-checked path data (`d` attributes only). */
const PATHS: Record<IconName, readonly string[]> = {
  camera: [
    'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z',
    'M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  ],
  scale: [
    'm16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z',
    'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z',
    'M7 21h10',
    'M12 3v18',
    'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2',
  ],
  target: [
    'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0',
    'M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0',
    'M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  ],
  megaphone: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  ],
  zap: [
    'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  ],
  star: [
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  ],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  'alert-triangle': [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
    'M12 9v4',
    'M12 17h.01',
  ],
  check: ['M20 6 9 17l-5-5'],
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M3 21v-5h5',
  ],
  trash: [
    'M3 6h18',
    'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
    'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.35-4.35'],
  award: [
    'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.722.522L12 19.805l-4.27 2.133a.5.5 0 0 1-.722-.522l1.515-8.526',
    'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  ],
  video: [
    'm22 8-6 4 6 4V8Z',
    'M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z',
  ],
  'video-off': [
    'm22 8-6 4 6 4V8Z',
    'M2 2l20 20',
    'M16 16v2a2 2 0 0 1-2 2H6',
    'M2 6a2 2 0 0 1 2-2h2',
    'm10 4 6 0a2 2 0 0 1 2 2v8',
  ],
};

export interface IconProps {
  name: IconName;
  /** Accessible name — only for icons without a visible text alternative. */
  title?: string;
  className?: string;
}

export function Icon({ name, title, className }: IconProps) {
  const paths = PATHS[name] ?? [];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[styles.icon, className].filter(Boolean).join(' ')}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
