import type { ReactNode } from 'react';
import { Role } from 'api-contracts';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function JuryLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={[Role.Jury]}>
      <DashboardShell role={Role.Jury}>{children}</DashboardShell>
    </RoleGuard>
  );
}
