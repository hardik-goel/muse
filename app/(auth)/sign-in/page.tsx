import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { GoogleButton } from '@/components/auth/GoogleButton';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  // Only same-origin paths are honoured, so ?next= cannot become an open redirect.
  const next = params.next?.startsWith('/') ? params.next : '/now';

  return (
    <AuthShell eyebrow="who's here?" headline="Welcome back.">
      <SignInForm next={next} />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton next={next} />

      <p className="mt-5 text-sm text-muted">
        <Link href="/reset" className="text-champagne underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </p>

      <p className="mt-2 text-sm text-muted">
        New here?{' '}
        <Link href="/sign-up" className="text-champagne underline-offset-4 hover:underline">
          Make an account
        </Link>
        .
      </p>
    </AuthShell>
  );
}
