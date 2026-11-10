'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Role } from 'api-contracts';
import { getRoleHomePath, getRoleLabel } from '@/lib/auth/route-access';
import { useAuth } from '@/lib/auth/session';
import { ErrorState, LoadingState } from '../feedback/state-panel';
import { buttonClassName } from '../ui/button';

export interface RoleGuardProps {
  allowedRoles: readonly Role[];
  children: ReactNode;
}

/**
 * Client-side route-group guard for UX gating.
 *
 * Important: UI gating is never a security boundary — every protected API
 * endpoint validates authentication and role permissions on the backend.
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { status, user, errorMessage, refreshSession } = useAuth();

  if (status === 'loading') {
    return (
      <LoadingState
        title="Checking session"
        message="Verifying your account access with the platform…"
      />
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not verify your session"
        message={errorMessage ?? 'Unable to reach the authentication service.'}
        onRetry={() => void refreshSession()}
      />
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <ErrorState
        title="Sign in required"
        message="You need to sign in with an authorized account before viewing this workspace."
        action={
          <Link href="/login" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
            Go to sign in
          </Link>
        }
      />
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <ErrorState
        title="Access restricted"
        message={`Your current account (${getRoleLabel(user.role)}) does not have access to this workspace.`}
        action={
          <Link
            href={getRoleHomePath(user.role)}
            className={buttonClassName({ variant: 'primary', size: 'sm' })}
          >
            Go to your workspace
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
