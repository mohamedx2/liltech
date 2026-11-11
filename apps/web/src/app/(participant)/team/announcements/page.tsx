import type { Metadata } from 'next';
import { AnnouncementsView } from '@/features/announcements/announcements-view';

export const metadata: Metadata = {
  title: 'Live Announcements · LilTech 2026',
  description: 'Broadcast updates, schedule reminders, and mentor notices from the organizers.',
};

export default function AnnouncementsPage() {
  return <AnnouncementsView />;
}
