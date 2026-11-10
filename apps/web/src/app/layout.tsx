import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brandConfig } from '@/config/brand';
import { AuthProvider } from '@/lib/auth/session';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: brandConfig.productName,
    template: `%s | ${brandConfig.productName}`,
  },
  description: `${brandConfig.tagline} ${brandConfig.productName} — ${brandConfig.eventDates}, ${brandConfig.eventLocation}.`,
  icons: {
    icon: brandConfig.favicon,
  },
};

const COLOR_SCHEME_INIT_SCRIPT =
  "try{var s=localStorage.getItem('color-scheme');if(s==='light'||s==='dark'){var m=document.querySelector('meta[name=\"color-scheme\"]');if(m)m.content=s;}}catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  const defaultMetaContent =
    brandConfig.theme.defaultMode === 'system' ? 'light dark' : brandConfig.theme.defaultMode;

  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content={defaultMetaContent} suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link visually-hidden">
          Skip to main content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
