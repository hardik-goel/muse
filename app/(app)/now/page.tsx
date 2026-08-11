import type { Metadata } from 'next';
import { NowTab } from '@/components/now/NowTab';

export const metadata: Metadata = { title: 'Now' };

export default function NowPage() {
  return <NowTab />;
}
