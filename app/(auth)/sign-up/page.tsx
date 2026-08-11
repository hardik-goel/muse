import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { GoogleButton } from '@/components/auth/GoogleButton';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') ? params.next : '/onboarding';

  return (
    <AuthShell eyebrow="who's here?" headline="Start dropping things in.">
      <SignUpForm next={next} />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton next={next} />

      <p className="mt-5 text-sm text-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-champagne underline-offset-4 hover:underline">
          Sign in
        </Link>
        .
      </p>

      <p className="mt-4 text-xs text-faint">
        By continuing you agree to the{' '}
        <Link href="/terms" className="underline underline-offset-4">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </AuthShell>
  );
}
