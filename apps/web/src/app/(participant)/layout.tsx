import type { ReactNode } from 'react';
import { Role } from 'api-contracts';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={[Role.Team]}>
      <DashboardShell role={Role.Team}>{children}</DashboardShell>
    </RoleGuard>
  );
}
