import type { Metadata } from 'next';
import { TeamDashboardView } from '@/features/dashboard/team-dashboard-view';

export const metadata: Metadata = {
  title: 'Team Dashboard & Pass · LilTech 2026',
  description: 'Team competition progress, entrance QR badge pass, and roster status.',
};

export default function TeamPage() {
  return <TeamDashboardView />;
}
