import type { Metadata } from 'next';
import { PulseTab } from '@/components/pulse/PulseTab';

export const metadata: Metadata = { title: 'Pulse' };

export default function PulsePage() {
  return <PulseTab />;
}
