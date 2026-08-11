import type { Metadata } from 'next';
import { GuestShell } from '@/components/shell/GuestShell';

export const metadata: Metadata = {
  title: 'Guest',
  robots: { index: false, follow: false },
};

/**
 * Guest mode is the free tier with the account removed, not a demo. The whole
 * app runs here on Local mode with an in-tab store; nothing reaches the server.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <GuestShell>{children}</GuestShell>;
}
