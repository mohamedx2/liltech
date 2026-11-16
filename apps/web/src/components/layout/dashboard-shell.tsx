'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Role } from 'api-contracts';
import { getRoleLabel, getRoleNavItems } from '@/lib/auth/route-access';
import { SiteHeader } from '../navigation/site-header';
import { PageContainer } from './page-container';
import { SiteFooter } from './site-footer';
import styles from './dashboard-shell.module.css';

export interface DashboardShellProps {
  role: Role;
  children: ReactNode;
}

/**
 * Shared portal layout shell for authenticated role workspaces
 * (`team`, `jury`, `admin`).
 */
export function DashboardShell({ role, children }: DashboardShellProps) {
  const pathname = usePathname();
  const navItems = getRoleNavItems(role);

  return (
    <div className={styles.shell}>
      <SiteHeader />
      <PageContainer>
        <div className={styles.body}>
          <aside className={styles.sidebar} aria-label={`${getRoleLabel(role)} navigation`}>
            <p className={styles.roleHeading}>{getRoleLabel(role)} portal</p>
            <nav aria-label={`${getRoleLabel(role)} sections`}>
              <ul className={styles.navList}>
                {navItems.map((item) => {
                  const isCurrent =
                    pathname === item.href ||
                    (item.href !== '/admin' &&
                      item.href !== '/team' &&
                      item.href !== '/jury' &&
                      Boolean(pathname?.startsWith(item.href)));

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
          </aside>

          <main id="main-content" className={styles.main}>
            {children}
          </main>
        </div>
      </PageContainer>
      <SiteFooter />
    </div>
  );
}
