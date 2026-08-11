'use client';

import type { ReactNode } from 'react';
import { StoreProvider, type SessionInfo } from '@/components/shell/StoreProvider';
import { AppShell } from '@/components/shell/AppShell';

const GUEST_SESSION: SessionInfo = {
  guest: true,
  profile: null,
  settings: null,
  stats: null,
  flags: { bulk_actions: true },
  // No account, no plan, no AI. Local mode does all of the work here.
  aiActive: false,
};

export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider session={GUEST_SESSION}>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
