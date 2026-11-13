/**
 * Centralized brand configuration for LilTech 2026.
 *
 * Event partner artwork lives in `apps/web/public/brand/`. LilTech keeps
 * its text wordmark until a dedicated event logo is supplied.
 */

export interface BrandConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly tagline: string;
  readonly eventDates: string;
  readonly eventLocation: string;
  readonly organizers: readonly string[];
  readonly organizerLogos: readonly {
    readonly src: string;
    readonly alt: string;
    /** Live text rendered beside the mark when the artwork itself has no lettering. */
    readonly label?: string;
    readonly width: number;
    readonly height: number;
  }[];
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
  organizerLogos: [
    {
      src: '/brand/gdg-on-campus-epi.svg',
      alt: 'GDG on Campus EPI',
      width: 960,
      height: 1330,
    },
    {
      src: '/brand/isitcom-google-club.svg',
      alt: 'ISITCom Google Club',
      label: 'ISITCom Google Club',
      width: 1099,
      height: 1431,
    },
  ],
  logos: {
    light: null,
    dark: null,
    default: '/brand/liltech-logo.jpg',
    alt: 'LilTech 2026 logo',
    width: 1254,
    height: 1104,
  },
  favicon: '/brand/liltech-icon.png',
  theme: {
    defaultMode: 'dark',
    supportsColorSchemeSwitch: false,
  },
  typography: {
    headingFontVar: 'var(--font-heading)',
    bodyFontVar: 'var(--font-body)',
    monoFontVar: 'var(--font-mono)',
  },
};
