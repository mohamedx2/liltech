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

export default function RootLayout({ children }: { children: ReactNode }) {
  const defaultMetaContent =
    brandConfig.theme.defaultMode === 'system' ? 'light dark' : brandConfig.theme.defaultMode;

  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content={defaultMetaContent} suppressHydrationWarning />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Cairo:wght@600;800&display=swap"
        />
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
