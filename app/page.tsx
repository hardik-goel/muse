import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/ui/Wordmark';
import { supabaseServer } from '@/lib/supabase/server';

export default async function LandingPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/now');

  return (
    <main id="main" className="relative flex min-h-dvh flex-col justify-between gutter py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] bg-wine opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <Wordmark size="lg" />
        {/* The promise is the page's heading, not decoration: it is what a
            screen reader should announce and what search results should show. */}
        <h1 className="mt-4 max-w-[22ch] font-display text-[clamp(1.5rem,7vw,2rem)] font-normal leading-tight text-soft">
          Everything you find, one calm place.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Drop in a link, a photo, a half-formed thought. Muse titles it, files it, and tells you
          what to finish first. Organising is our job.
        </p>

        <div className="mt-9 flex flex-col gap-3">
          <Link
            href="/sign-up"
            className="inline-flex h-12 items-center justify-center rounded-pill bg-champagne px-6 font-medium text-bg transition-colors hover:bg-champDeep"
          >
            Make an account
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-12 items-center justify-center rounded-pill border border-line bg-raised px-6 font-medium text-text transition-colors hover:border-champagne/40"
          >
            Sign in
          </Link>
          <Link
            href="/guest"
            data-testid="guest-link"
            className="inline-flex h-12 items-center justify-center rounded-pill px-6 text-soft transition-colors hover:text-text"
          >
            Look around first
          </Link>
        </div>
      </div>

      <footer className="relative mx-auto w-full max-w-sm pt-8 text-xs text-faint">
        <div className="flex gap-4">
          <Link href="/plans" className="hover:text-muted">
            Plans
          </Link>
          <Link href="/privacy" className="hover:text-muted">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-muted">
            Terms
          </Link>
        </div>
      </footer>
    </main>
  );
}
