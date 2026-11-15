import type { Metadata } from 'next';
import { AdminChallengesView } from '@/features/admin/admin-challenges-view';

export const metadata: Metadata = {
  title: 'Challenges · LilTech 2026 Admin',
  description: 'Write, start, end and reveal the main challenges.',
};

export default function AdminChallengesPage() {
  return <AdminChallengesView />;
}
