import type { Metadata } from 'next';
import { AdminCtfView } from '@/features/admin/admin-ctf-view';

export const metadata: Metadata = {
  title: 'Mini-CTF · LilTech 2026 Admin',
  description: 'Mini-CTF clock, LOUAGE 404 stage configuration and team progress.',
};

export default function AdminCtfPage() {
  return <AdminCtfView />;
}
