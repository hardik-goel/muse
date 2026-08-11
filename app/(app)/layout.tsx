import { redirect } from 'next/navigation';
import { StoreProvider } from '@/components/shell/StoreProvider';
import { AppShell } from '@/components/shell/AppShell';
import { loadSession, loadSnapshot, toSessionInfo } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSession();

  // Onboarding is skippable but not bypassable — three questions, once.
  if (!session.profile.onboarded) redirect('/onboarding');

  const snapshot = await loadSnapshot(session.user.id);

  return (
    <StoreProvider session={toSessionInfo(session)} initial={snapshot}>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
