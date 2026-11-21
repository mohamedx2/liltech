import type { Metadata } from 'next';
import { AdminResultsView } from '@/features/admin/admin-results-view';

export const metadata: Metadata = {
  title: 'Results · LilTech 2026 Admin',
  description: 'Team scores: Mini-CTF, both challenges and the final ranking.',
};

export default function AdminResultsPage() {
  return <AdminResultsView />;
}
