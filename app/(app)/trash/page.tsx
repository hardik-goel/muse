import type { Metadata } from 'next';
import { TrashScreen } from '@/components/settings/TrashScreen';

export const metadata: Metadata = { title: 'Trash' };
export const dynamic = 'force-dynamic';

export default function TrashPage() {
  return <TrashScreen />;
}
