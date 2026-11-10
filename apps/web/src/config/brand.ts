/**
 * Centralized brand configuration for LilTech 2026.
 *
 * Official logos, colors, and typography are not finalized yet.
 * Replace the asset paths here once official files are placed in
 * `apps/web/public/brand/` and update token values in `src/styles/`.
 */

export interface BrandConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly tagline: string;
  readonly eventDates: string;
  readonly eventLocation: string;
  readonly organizers: readonly string[];
  readonly logos: {
    /** Set to `'/brand/logo-light.svg'` when official light-mode logo is added. */
    readonly light: string | null;
    /** Set to `'/brand/logo-dark.svg'` when official dark-mode logo is added. */
    readonly dark: string | null;
    /** Fallback single logo path if only one SVG is provided. */
    readonly default: string | null;
    readonly alt: string;
    readonly width: number;
    readonly height: number;
  };
  readonly favicon: string;
  readonly theme: {
    readonly defaultMode: 'system' | 'light' | 'dark';
    readonly supportsColorSchemeSwitch: boolean;
  };
  readonly typography: {
    readonly headingFontVar: string;
    readonly bodyFontVar: string;
    readonly monoFontVar: string;
  };
}

export const brandConfig: BrandConfig = {
  productName: 'LilTech 2026',
  shortName: 'LilTech',
  tagline: 'One night. Two challenges. One platform to run it all.',
  eventDates: 'November 21–22, 2026',
  eventLocation: 'Campus EPI, Sousse, Tunisia',
  organizers: ['GDG on Campus EPI', 'ISITCom Google Club'],
  logos: {
    light: null,
    dark: null,
    default: null,
    alt: 'LilTech 2026 logo',
    width: 132,
    height: 32,
  },
  favicon: '/favicon.ico',
  theme: {
    defaultMode: 'system',
    supportsColorSchemeSwitch: true,
  },
  typography: {
    headingFontVar: 'var(--font-heading)',
    bodyFontVar: 'var(--font-body)',
    monoFontVar: 'var(--font-mono)',
  },
};
