import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetForm } from '@/components/auth/ResetForm';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  // ?mode=update is the state the emailed link lands in, with a live session.
  const mode = params.mode === 'update' ? 'update' : 'request';

  return (
    <AuthShell
      eyebrow="who's here?"
      headline={mode === 'update' ? 'Pick a new one.' : 'Happens to everyone.'}
    >
      <ResetForm mode={mode} />

      <p className="mt-6 text-sm text-muted">
        <Link href="/sign-in" className="text-champagne underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
