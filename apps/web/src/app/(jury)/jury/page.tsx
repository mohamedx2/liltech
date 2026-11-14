import type { Metadata } from 'next';
import { JuryOverviewView } from '@/features/jury/jury-overview-view';

export const metadata: Metadata = {
  title: 'Jury Evaluation Workspace · LilTech 2026',
  description: 'Track-scoped jury evaluation portal for scoring assigned hackathon teams.',
};

export default function JuryPage() {
  return <JuryOverviewView />;
}
