import type { Metadata } from 'next';
import { AdminJuryView } from '@/features/admin/admin-jury-view';

export const metadata: Metadata = {
  title: 'Jury · LilTech 2026 Admin',
  description: 'Jury accounts with evaluation access.',
};

export default function AdminJuryPage() {
  return <AdminJuryView />;
}
