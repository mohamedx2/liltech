'use client';

import Link from 'next/link';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRoleHomePath, getRoleLabel } from '@/lib/auth/route-access';
import { useAuth } from '@/lib/auth/session';

export function UnauthorizedView() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <LoadingState
        title="Checking permissions"
        message="Verifying which workspace matches your current account…"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">Access restricted</CardTitle>
        <CardDescription>
          LilTech separates team, jury, and organizer permissions on the server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === 'authenticated' && user ? (
          <ErrorState
            title={`Signed in as ${getRoleLabel(user.role)}`}
            message="Your account role does not permit access to the requested page. Continue to your authorized workspace or switch accounts."
            action={
              <>
                <Link
                  href={getRoleHomePath(user.role)}
                  className={buttonClassName({ variant: 'primary', size: 'sm' })}
                >
                  Open {getRoleLabel(user.role)} workspace
                </Link>
                <Link href="/login" className={buttonClassName({ variant: 'outline', size: 'sm' })}>
                  Switch account
                </Link>
              </>
            }
          />
        ) : (
          <ErrorState
            title="Authentication required"
            message="Please sign in with an account holding the required role (team, jury, or admin) to access this area."
            action={
              <>
                <Link href="/login" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
                  Sign in
                </Link>
                <Link href="/" className={buttonClassName({ variant: 'outline', size: 'sm' })}>
                  Back to overview
                </Link>
              </>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
