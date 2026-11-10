import type { Metadata } from 'next';
import { SubmissionsView } from '@/features/submissions/submissions-view';

export const metadata: Metadata = {
  title: 'Project Deliverables & Submissions · LilTech 2026',
  description: 'Upload team deliverables and codebase repository before the 08:00 UTC deadline.',
};

export default function SubmissionsPage() {
  return <SubmissionsView />;
}
