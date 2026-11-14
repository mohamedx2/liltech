import type { Metadata } from 'next';
import { CheckInScannerView } from '@/features/checkin/checkin-scanner-view';

export const metadata: Metadata = {
  title: 'QR Badge Check-In Scanner · LilTech 2026',
  description:
    'Entrance station for rapid participant QR badge verification and attendance management.',
};

export default function CheckinPage() {
  return <CheckInScannerView />;
}
