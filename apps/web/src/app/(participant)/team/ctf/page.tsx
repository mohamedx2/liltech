import type { Metadata } from 'next';
import { MiniCtfView } from '@/features/mini-ctf/mini-ctf-view';

export const metadata: Metadata = {
  title: 'Mini-CTF Gate · LilTech 2026',
  description:
    'Submit your Mini-CTF flag to unlock your track assignment and main challenge brief.',
};

export default function MiniCtfPage() {
  return <MiniCtfView />;
}
