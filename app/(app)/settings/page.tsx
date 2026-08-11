import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { loadSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await loadSession();

  return (
    <SettingsScreen
      profile={session.profile}
      settings={session.settings}
      stats={session.stats}
      email={session.user.email ?? session.profile.email}
    />
  );
}
