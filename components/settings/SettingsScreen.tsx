'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Toggle } from '@/components/ui/Field';
import { Section } from '@/components/ui/States';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { supabaseBrowser } from '@/lib/supabase/client';
import { DAY_LABELS, type NotifPrefs, type Profile, type UserSettings, type UserStats } from '@/lib/types';
import { publicEnv } from '@/lib/env';
import { ShortcutTokens } from '@/components/settings/ShortcutTokens';
import { DataSection } from '@/components/settings/DataSection';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push-client';

const NOTIF_LABELS: { key: keyof NotifPrefs; label: string; description: string }[] = [
  { key: 'morning_brief', label: 'Morning brief', description: 'One message, at the time you pick.' },
  { key: 'workout', label: 'Training', description: 'Only on days your split has a session.' },
  { key: 'review_due', label: 'Review nudge', description: 'When the inbox has been ignored for a week.' },
  { key: 'streak_guard', label: 'Streak guard', description: 'Evening warning before a streak breaks.' },
  { key: 'email_digest', label: 'Weekly email', description: 'What happened, once a week. Opt-in.' },
];

/**
 * Settings.
 *
 * Everything writes immediately — there is no Save button on a toggle, because
 * a toggle that needs saving is a toggle people get wrong. The two exceptions
 * are the free-text fields, which save on blur.
 */
export function SettingsScreen({
  profile,
  settings: initialSettings,
  stats,
  email,
}: {
  profile: Profile;
  settings: UserSettings;
  stats: UserStats;
  email: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [settings, setSettings] = useState(initialSettings);
  const [name, setName] = useState(profile.name);
  const [why, setWhy] = useState(settings.workout_why);
  const [split, setSplit] = useState<string[]>(settings.workout_split);
  const [pushOn, setPushOn] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ message: failure.error ?? 'That did not save.', tone: 'bad' });
        return false;
      }

      const data = (await res.json()) as { settings: UserSettings };
      setSettings(data.settings);
      return true;
    },
    [toast],
  );

  async function saveName() {
    if (name.trim() === profile.name) return;
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    toast.push({ message: 'Saved.', tone: 'good' });
    router.refresh();
  }

  async function togglePush(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const result = await subscribeToPush(publicEnv.vapidPublicKey);
        if (!result.ok) {
          toast.push({ message: result.message, tone: 'bad' });
          return;
        }
        setPushOn(true);
        toast.push({ message: 'Nudges on.', tone: 'good' });
      } else {
        await unsubscribeFromPush();
        setPushOn(false);
        toast.push({ message: 'Nudges off.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push('/');
    router.refresh();
  }

  async function sendFeedback() {
    if (!feedback.trim()) return;
    setBusy(true);
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: feedback.trim() }),
    });
    setBusy(false);
    setFeedbackOpen(false);
    setFeedback('');
    toast.push({
      message: res.ok ? 'Read and noted.' : 'That did not send.',
      tone: res.ok ? 'good' : 'bad',
    });
  }

  const planLabel =
    settings.plan === 'intelligence'
      ? settings.plan_status === 'trialing'
        ? 'Intelligence — trial'
        : 'Intelligence'
      : 'Local';

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-[clamp(1.75rem,7vw,2.25rem)] leading-tight text-text">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">{email}</p>
      </header>

      <Section eyebrow="you">
        <div className="card flex flex-col gap-4 px-5 py-5">
          <Field label="name">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName()}
              />
            )}
          </Field>

          <Field label="timezone" hint="Every “today” in Muse is measured here.">
            {({ id }) => (
              <Input
                id={id}
                value={profile.timezone}
                readOnly
                aria-describedby={`${id}-hint`}
                className="text-muted"
              />
            )}
          </Field>

          <Button
            variant="secondary"
            onClick={() =>
              void patch({
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }).then((ok) => ok && router.refresh())
            }
          >
            Use this device&rsquo;s timezone
          </Button>
        </div>
      </Section>

      <Section eyebrow="plan">
        <div className="card flex flex-col gap-3 px-5 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-xl text-text">{planLabel}</p>
            <Link href="/plans" className="text-sm text-champagne underline-offset-4 hover:underline">
              {settings.plan === 'intelligence' ? 'Manage' : 'See plans'}
            </Link>
          </div>

          {settings.plan_status === 'trialing' && settings.trial_ends_at ? (
            <p className="text-sm text-muted">
              Trial ends {new Date(settings.trial_ends_at).toLocaleDateString()}.
            </p>
          ) : null}

          <Toggle
            checked={settings.ai_enabled}
            disabled={settings.plan !== 'intelligence'}
            label="Intelligence"
            description={
              settings.plan === 'intelligence'
                ? 'Real classification, The Current, Ask, Threads.'
                : 'Local mode does all of this with rules. Upgrade for the model.'
            }
            onChange={(next) => void patch({ aiEnabled: next })}
          />
        </div>
      </Section>

      <Section eyebrow="nudges">
        <div className="card flex flex-col gap-1 px-5 py-4">
          <Toggle
            checked={settings.notif_master}
            label="Notifications"
            description="One switch over everything below."
            onChange={(next) => void patch({ notifMaster: next })}
          />

          <div className="border-t border-line pt-1">
            <Toggle
              checked={pushOn}
              disabled={busy || !settings.notif_master}
              label="This device"
              description="Register this browser to receive them."
              onChange={(next) => void togglePush(next)}
            />
          </div>

          {NOTIF_LABELS.map((notif) => (
            <Toggle
              key={notif.key}
              checked={Boolean(settings.notif_prefs?.[notif.key])}
              disabled={!settings.notif_master}
              label={notif.label}
              description={notif.description}
              onChange={(next) => void patch({ notifPrefs: { [notif.key]: next } })}
            />
          ))}

          <div className="border-t border-line pt-4">
            <Field label="brief time" hint="Your local time.">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  // Postgres hands back HH:MM:SS; the control wants HH:MM.
                  value={settings.brief_time.slice(0, 5)}
                  onChange={(e) => void patch({ briefTime: e.target.value })}
                  className="max-w-[9rem]"
                />
              )}
            </Field>
          </div>
        </div>
      </Section>

      <Section eyebrow="training">
        <div className="card flex flex-col gap-3 px-5 py-4">
          <Toggle
            checked={settings.workout_enabled}
            label="I train"
            description="Muse will name the session and hold you to your reason."
            onChange={(next) => void patch({ workoutEnabled: next })}
          />

          {settings.workout_enabled ? (
            <>
              <div>
                <p className="eyebrow">the split</p>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {DAY_LABELS.map((day, index) => (
                    <label key={day} className="flex flex-col items-center gap-1">
                      <span className="font-mono text-[0.5625rem] uppercase tracking-eyebrow text-faint">
                        {day}
                      </span>
                      <input
                        aria-label={`${day} session`}
                        value={split[index] ?? ''}
                        maxLength={12}
                        onChange={(e) => {
                          const next = [...split];
                          next[index] = e.target.value;
                          setSplit(next);
                        }}
                        onBlur={() => void patch({ workoutSplit: split.map((d) => d.trim() || 'Rest') })}
                        className="w-full rounded-2xl border border-line bg-raised px-1 py-2 text-center text-xs text-text focus:border-champagne/50 focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Leave a day blank for rest.</p>
              </div>

              <Field label="why you train" hint="Read back to you on the mornings it is inconvenient.">
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    maxLength={280}
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    onBlur={() => void patch({ workoutWhy: why.trim() })}
                  />
                )}
              </Field>
            </>
          ) : null}
        </div>
      </Section>

      <ShortcutTokens />

      <DataSection />

      <Section eyebrow="momentum">
        <div className="card grid grid-cols-3 gap-3 px-5 py-5">
          <Stat value={stats.daily_streak} label="day streak" />
          <Stat value={stats.week_streak} label="reviews" />
          <Stat value={stats.points} label="points" />
        </div>
      </Section>

      <Section eyebrow="the rest">
        <div className="card flex flex-col gap-2 px-5 py-5">
          <Button variant="secondary" onClick={() => setFeedbackOpen(true)}>
            Tell us something
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} data-testid="sign-out">
            Sign out
          </Button>
          <div className="flex gap-4 pt-2 text-xs text-faint">
            <Link href="/privacy" className="hover:text-muted">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-muted">
              Terms
            </Link>
          </div>
        </div>
      </Section>

      <Sheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Tell us something.">
        <div className="flex flex-col gap-4">
          <Textarea
            rows={5}
            maxLength={4000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What is not working, or what should exist."
            aria-label="Your feedback"
          />
          <Button full busy={busy} disabled={!feedback.trim()} onClick={() => void sendFeedback()}>
            Send it
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl leading-none text-text">{value}</p>
      <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-eyebrow text-faint">{label}</p>
    </div>
  );
}
