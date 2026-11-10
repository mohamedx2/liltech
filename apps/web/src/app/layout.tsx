import './globals.css';

export const metadata = {
  title: 'LilTech 2026',
  description:
    'One night. Two challenges. One platform to run it all. LilTech 2026 — November 21–22, 2026, Campus EPI, Sousse.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="skip-link"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '0',
            background: 'var(--color-primary)',
            color: 'white',
            padding: 'var(--space-3) var(--space-4)',
            zIndex: 100,
          }}
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
