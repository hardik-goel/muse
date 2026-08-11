import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { loadSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

/**
 * Three questions, once. Skippable at any step — a skipped answer just means we
 * guess for a while longer, not that the product refuses to work.
 */
export default async function OnboardingPage() {
  const session = await loadSession();
  if (session.profile.onboarded) redirect('/now');

  return (
    <OnboardingFlow
      name={session.profile.name}
      timezone={session.profile.timezone}
      trainsAlready={session.settings.workout_enabled}
    />
  );
}
