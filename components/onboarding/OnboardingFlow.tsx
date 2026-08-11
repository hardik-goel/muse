'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Pill';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Wordmark } from '@/components/ui/Wordmark';
import { useToast } from '@/components/ui/Toast';
import { INTERESTS } from '@/lib/types';
import { readGuestSession, clearGuestSession } from '@/lib/guest';

type Step = 0 | 1 | 2;

/**
 * Onboarding.
 *
 * Every step can be skipped and none of them blocks the product. What the
 * answers actually buy: the interests pre-create groups so the library is not
 * an empty grid on day one, and "I train" turns on the one habit that needs a
 * reason written down to survive a bad week.
 */
export function OnboardingFlow({
  name,
  timezone,
  trainsAlready,
}: {
  name: string;
  timezone: string;
  trainsAlready: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [trains, setTrains] = useState(trainsAlready);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setInterests((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  async function finish() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests,
          trains,
          why: why.trim(),
          // The browser knows the timezone better than whatever was guessed at
          // signup, and every "today" in the product depends on it.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || timezone,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'That did not save.');
      }

      await importGuestWork(toast.push);

      router.push('/now');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
      setBusy(false);
    }
  }

  return (
    <main id="main" className="relative flex min-h-dvh flex-col justify-center gutter py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] bg-wine opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="relative mx-auto w-full max-w-sm">
        <Wordmark size="md" />

        <div className="mt-8 flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-pill ${index <= step ? 'bg-champagne' : 'bg-line'}`}
            />
          ))}
        </div>

        {step === 0 ? (
          <section className="mt-7">
            <p className="eyebrow">one of three</p>
            <h1 className="mt-1.5 font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
              {name ? `${name}. What do you collect?` : 'What do you collect?'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pick as many as fit. We will make the shelves so nothing lands nowhere.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <Chip
                  key={interest.key}
                  active={interests.includes(interest.key)}
                  onClick={() => toggle(interest.key)}
                >
                  {interest.label}
                </Chip>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-2">
              <Button full onClick={() => setStep(1)} data-testid="onboarding-next">
                Next
              </Button>
              <Button variant="ghost" full onClick={() => void finish()} busy={busy}>
                Skip all this
              </Button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mt-7">
            <p className="eyebrow">two of three</p>
            <h1 className="mt-1.5 font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
              Do you train?
            </h1>
            <p className="mt-2 text-sm text-muted">
              If you do, Muse will hold you to it. If you do not, it will never mention it again.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                variant={trains ? 'primary' : 'secondary'}
                onClick={() => setTrains(true)}
                aria-pressed={trains}
              >
                I train
              </Button>
              <Button
                variant={!trains ? 'primary' : 'secondary'}
                onClick={() => setTrains(false)}
                aria-pressed={!trains}
              >
                Not right now
              </Button>
            </div>

            <div className="mt-8 flex flex-col gap-2">
              <Button full onClick={() => setStep(2)}>
                Next
              </Button>
              <Button variant="ghost" full onClick={() => setStep(0)}>
                Back
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mt-7">
            <p className="eyebrow">three of three</p>
            <h1 className="mt-1.5 font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
              {trains ? 'Why do you train?' : 'What are you here to finish?'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {trains
                ? 'On the mornings you do not feel like it, Muse will read this back to you. Write the real reason.'
                : 'One line. It shows up when you are deciding what to do next.'}
            </p>

            <div className="mt-5">
              <Field label={trains ? 'the reason' : 'the thing'}>
                {({ id }) =>
                  trains ? (
                    <Textarea
                      id={id}
                      rows={3}
                      maxLength={280}
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      placeholder="Because I said I would."
                    />
                  ) : (
                    <Input
                      id={id}
                      maxLength={280}
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      placeholder="Ship the thing."
                    />
                  )
                }
              </Field>
            </div>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-red">
                {error}
              </p>
            ) : null}

            <div className="mt-8 flex flex-col gap-2">
              <Button full busy={busy} onClick={() => void finish()} data-testid="onboarding-finish">
                Start dropping things in
              </Button>
              <Button variant="ghost" full onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

/**
 * A guest session that survived into a real account is imported here as well as
 * at signup, because email verification means the account can exist minutes
 * after the guest work was done — and in a different tab.
 */
async function importGuestWork(push: (t: { message: string; tone?: 'good' | 'bad' }) => void) {
  const guest = readGuestSession();
  if (!guest || guest.items.length === 0) return;

  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest.artifact),
    });
    if (!res.ok) return;

    const body = (await res.json()) as { imported: number };
    clearGuestSession();
    if (body.imported > 0) {
      push({ message: `Brought ${body.imported} across.`, tone: 'good' });
    }
  } catch {
    // The snapshot stays in the tab; Settings → Data can retry it.
  }
}
