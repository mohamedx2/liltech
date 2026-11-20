import type { Metadata } from 'next';
import { AdminEmailView } from '@/features/admin/admin-email-view';

export const metadata: Metadata = {
  title: 'Badge Email Dispatch · LilTech 2026',
  description:
    'Send QR badge emails to all participants using a custom or default template. Admin only.',
};

export default function AdminEmailsPage() {
  return <AdminEmailView />;
}
