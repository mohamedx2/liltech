import type { Metadata } from 'next';
import { AdminDashboardView } from '@/features/admin/admin-dashboard-view';

export const metadata: Metadata = {
  title: 'Admin Control Panel · LilTech 2026',
  description:
    'Authoritative event phase controls, system monitoring, and administrative audit log.',
};

export default function AdminPage() {
  return <AdminDashboardView />;
}
