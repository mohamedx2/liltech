import type { Metadata } from 'next';
import { AdminChallengesView } from '@/features/admin/admin-challenges-view';

export const metadata: Metadata = {
  title: 'Challenges · LilTech 2026 Admin',
  description: 'Challenge content, start and end controls.',
};

export default function AdminChallengesPage() {
  return <AdminChallengesView />;
}
