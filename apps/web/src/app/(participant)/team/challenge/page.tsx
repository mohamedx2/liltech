import type { Metadata } from 'next';
import { ChallengeView } from '@/features/challenges/challenge-view';

export const metadata: Metadata = {
  title: 'Track Challenge Workspace · LilTech 2026',
  description: 'Main challenge problem statement, requirements, and downloadable resources.',
};

export default function ChallengePage() {
  return <ChallengeView />;
}
