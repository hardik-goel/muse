import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { Wordmark } from '@/components/ui/Wordmark';
import { Section } from '@/components/ui/States';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The operator's view. Aggregates only — no item titles, no note bodies, no way
 * to read one person's library. Gated on an env allowlist rather than a role
 * column so it cannot be granted by a database write.
 */
export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = serverEnv.adminEmails;
  const email = user?.email?.toLowerCase() ?? '';

  // 404 rather than 403: an unauthorised visitor learns nothing about whether
  // this page exists.
  if (!user || allowed.length === 0 || !allowed.includes(email)) notFound();

  const admin = supabaseAdmin();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [users, items, itemsWeek, aiDay, aiFailures, feedback, flags] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('items').select('id', { count: 'exact', head: true }),
    admin.from('items').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('ai_usage_log').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
    admin
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('ok', false)
      .gte('created_at', dayAgo),
    admin.from('feedback').select('id, text, created_at').order('created_at', { ascending: false }).limit(15),
    admin.from('feature_flags').select('key, env, enabled').order('key'),
  ]);

  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-3xl gutter py-10">
      <Link href="/now" className="inline-block">
        <Wordmark size="sm" />
      </Link>

      <h1 className="mt-8 font-display text-[clamp(1.75rem,7vw,2.5rem)] leading-tight text-text">
        Admin
      </h1>
      <p className="mt-1 text-sm text-muted">Counts only. No one&rsquo;s library is readable here.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="accounts" value={users.count ?? 0} />
        <Metric label="items" value={items.count ?? 0} />
        <Metric label="items this week" value={itemsWeek.count ?? 0} />
        <Metric label="ai calls 24h" value={aiDay.count ?? 0} />
        <Metric label="ai failures 24h" value={aiFailures.count ?? 0} />
        <Metric label="feedback" value={(feedback.data ?? []).length} />
      </div>

      <div className="mt-9 flex flex-col gap-8">
        <Section eyebrow="feature flags">
          <div className="card flex flex-col gap-2 px-5 py-4">
            {(flags.data ?? []).map((flag) => (
              <div
                key={`${flag.key}-${flag.env}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-soft">
                  {flag.key as string}
                  <span className="ml-2 font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">
                    {flag.env as string}
                  </span>
                </span>
                <span className={flag.enabled ? 'text-green' : 'text-faint'}>
                  {flag.enabled ? 'on' : 'off'}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="recent feedback">
          {(feedback.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(feedback.data ?? []).map((row) => (
                <li key={row.id as string} className="card px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm text-soft">{row.text as string}</p>
                  <p className="mt-1.5 font-mono text-[0.625rem] text-faint">
                    {relativeTime(row.created_at as string)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-4">
      <p className="font-display text-3xl leading-none text-text">{value}</p>
      <p className="mt-1.5 font-mono text-[0.5625rem] uppercase tracking-eyebrow text-faint">
        {label}
      </p>
    </div>
  );
}
