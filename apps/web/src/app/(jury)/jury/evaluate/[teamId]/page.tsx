import type { Metadata } from 'next';
import { TeamEvaluationView } from '@/features/jury/team-evaluation-view';

export const metadata: Metadata = {
  title: 'Evaluate Team · LilTech 2026',
  description: 'Score team deliverables, pitch performance, and submit jury evaluations.',
};

export default async function EvaluateTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamEvaluationView teamId={teamId} />;
}
