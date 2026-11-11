import type { Metadata } from 'next';
import { UnauthorizedView } from '@/features/auth/unauthorized-view';

export const metadata: Metadata = {
  title: 'Access Restricted',
};

export default function UnauthorizedPage() {
  return <UnauthorizedView />;
}
