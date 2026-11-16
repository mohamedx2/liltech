import type { ReactNode } from 'react';
import { Role } from 'api-contracts';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={[Role.Admin]}>
      <DashboardShell role={Role.Admin}>{children}</DashboardShell>
    </RoleGuard>
  );
}
