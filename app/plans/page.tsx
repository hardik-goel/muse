import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';
import { PlanPicker } from '@/components/billing/PlanPicker';
import { supabaseServer } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

const LOCAL_FEATURES = [
  'Unlimited capture — links, photos, thoughts',
  'Automatic titles, groups and types, by rule',
  'The Current: one thing to do next, and why',
  'Weekly review, streaks, focus sessions',
  'Duplicate detection, export, offline capture',
];

const INTELLIGENCE_FEATURES = [
  'Everything in Local',
  'Real classification — reads what you actually wrote',
  'The Current, reasoned rather than scored',
  'Ask Muse: questions answered from your own library',
  'Morning briefs written for the day you are having',
  'Threads: connections across the library',
];

/**
 * Plans. The honest pitch: the free tier is the whole product, and Intelligence
 * is a better brain on top of it — not a paywall around the features.
 */
export default async function PlansPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main id="main" className="relative min-h-dvh gutter py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[35vh] bg-wine opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="relative mx-auto w-full max-w-2xl">
        <Link href={user ? '/now' : '/'} className="inline-block">
          <Wordmark size="md" />
        </Link>

        <h1 className="mt-8 font-display text-[clamp(2rem,9vw,3rem)] leading-tight text-text">
          Two plans. Both real.
        </h1>
        <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted">
          Local mode is not a trial. It files everything, ranks everything, and works with no
          account and no network. Intelligence swaps the rules for a model that has read what you
          wrote.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <section className="card flex flex-col gap-4 px-5 py-6">
            <div>
              <p className="eyebrow">local</p>
              <p className="mt-1.5 font-display text-3xl text-text">Free</p>
              <p className="mt-1 text-sm text-muted">Forever, and not crippled.</p>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-soft">
              {LOCAL_FEATURES.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-champagne">
                    ·
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-4 rounded-card bg-wine px-5 py-6">
            <div>
              <p className="eyebrow text-champagne/70">intelligence</p>
              <p className="mt-1.5 font-display text-3xl text-text">
                ₹{publicEnv.priceIntelligenceInr}
                <span className="ml-1 text-base text-soft">/month</span>
              </p>
              <p className="mt-1 text-sm text-soft">Cancel any time. Your items never leave.</p>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-soft">
              {INTELLIGENCE_FEATURES.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-champagne">
                    ·
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {user ? (
              <PlanPicker />
            ) : (
              <Link
                href="/sign-up?next=/plans"
                className="inline-flex h-11 items-center justify-center rounded-pill bg-champagne px-5 font-medium text-bg"
              >
                Make an account first
              </Link>
            )}
          </section>
        </div>

        <p className="mt-8 max-w-[52ch] text-xs leading-relaxed text-faint">
          If a subscription lapses, nothing is deleted and nothing is locked. Muse returns to Local
          mode and every item stays exactly where it is.
        </p>

        <div className="mt-8 flex gap-4 text-xs text-faint">
          <Link href="/privacy" className="hover:text-muted">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-muted">
            Terms
          </Link>
        </div>
      </div>
    </main>
  );
}
