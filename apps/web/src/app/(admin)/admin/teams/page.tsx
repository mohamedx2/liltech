import type { Metadata } from 'next';
import { AdminTeamsView } from '@/features/admin/admin-teams-view';

export const metadata: Metadata = {
  title: 'Teams · LilTech 2026 Admin',
  description: 'Registered teams, progress, and participant check-in state.',
};

export default function AdminTeamsPage() {
  return <AdminTeamsView />;
}
