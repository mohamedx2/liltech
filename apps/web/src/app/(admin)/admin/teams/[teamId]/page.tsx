import type { Metadata } from 'next';
import { AdminTeamDetailView } from '@/features/admin/admin-team-detail-view';

export const metadata: Metadata = {
  title: 'Manage Team · LilTech 2026 Admin',
  description: 'Team members, badges, check-in, Mini-CTF access and standing.',
};

export default async function AdminTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <AdminTeamDetailView teamId={teamId} />;
}
