'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/session';
import { getRoleHomePath, getRoleLabel, PUBLIC_NAV_ITEMS } from '@/lib/auth/route-access';
import { BrandMark } from '../layout/brand-mark';
import { PageContainer } from '../layout/page-container';
import { Badge } from '../ui/badge';
import { Button, buttonClassName } from '../ui/button';
import { Dialog } from '../ui/dialog';
import styles from './site-header.module.css';

export function SiteHeader() {
  const pathname = usePathname();
  const { status, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      setMobileMenuOpen(false);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className={styles.header}>
      <PageContainer>
        <div className={styles.inner}>
          <div className={styles.brandCluster}>
            <BrandMark variant="logo" />
          </div>

          <nav aria-label="Primary" className={styles.desktopNav}>
            <ul className={styles.navList}>
              {PUBLIC_NAV_ITEMS.map((item) => {
                const isCurrent = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={styles.navLink}
                      aria-current={isCurrent ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className={styles.actions}>
            {status === 'authenticated' && user ? (
              <>
                <Badge tone="info">{getRoleLabel(user.role)}</Badge>
                <Link
                  href={getRoleHomePath(user.role)}
                  className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                >
                  Open workspace
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  loading={signingOut}
                  loadingLabel="Signing out…"
                  onClick={() => void handleSignOut()}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonClassName({ variant: 'outline', size: 'sm' })}
                  aria-current={pathname === '/login' ? 'page' : undefined}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={buttonClassName({ variant: 'primary', size: 'sm' })}
                >
                  Register team
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </PageContainer>

      <Dialog
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Navigation"
        closeLabel="Close navigation menu"
      >
        <nav aria-label="Mobile">
          <ul className={styles.mobileNavList}>
            {PUBLIC_NAV_ITEMS.map((item) => {
              const isCurrent = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={styles.mobileNavLink}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.mobileActions}>
          {status === 'authenticated' && user ? (
            <>
              <Link
                href={getRoleHomePath(user.role)}
                className={buttonClassName({ variant: 'primary', size: 'md', fullWidth: true })}
                onClick={() => setMobileMenuOpen(false)}
              >
                Open {getRoleLabel(user.role)} workspace
              </Link>
              <Button
                variant="outline"
                size="md"
                fullWidth
                loading={signingOut}
                loadingLabel="Signing out…"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/register"
                className={buttonClassName({ variant: 'primary', size: 'md', fullWidth: true })}
                onClick={() => setMobileMenuOpen(false)}
              >
                Register team
              </Link>
              <Link
                href="/login"
                className={buttonClassName({ variant: 'outline', size: 'md', fullWidth: true })}
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </Dialog>
    </header>
  );
}
