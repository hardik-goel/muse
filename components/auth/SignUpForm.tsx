'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { readGuestSession, clearGuestSession, stashGuestHandoff } from '@/lib/guest';
import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { signUpErrorMessage } from '@/lib/auth-errors';

/**
 * Uncontrolled fields, for the same reason as SignInForm: text typed before
 * hydration must not disappear, and losing a half-typed password on the very
 * first screen of the product is the worst version of that bug.
 */
export function SignUpForm({ next = '/onboarding' }: { next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  // Tracked from the uncontrolled field's onChange rather than by making it
  // controlled: text typed before hydration still must not disappear.
  const [password, setPassword] = useState('');
  const strength = assessPassword(password);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const typed = String(form.get('password') ?? '');

    setBusy(true);
    setError(null);

    // Re-checked here rather than trusted from state, because autofill can put
    // a password in the field without ever firing a change event.
    const verdict = assessPassword(typed);
    if (!verdict.ok) {
      setPassword(typed);
      setError(verdict.summary || 'Pick a stronger password.');
      setBusy(false);
      return;
    }

    // Before the request, not after: whatever happens next — a verification
    // email opened in a fresh tab, a closed laptop, a different browser session
    // entirely — the guest work is already somewhere that outlives this tab.
    stashGuestHandoff();
    // Timezone is captured at signup; it drives brief timing and every
    // "today"-shaped calculation from here on.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

    // Our own origin, not Supabase's. A browser that cannot reach supabase.co —
    // filtered DNS, a content blocker, Private Relay — can still sign up,
    // because it only ever talks to the host it loaded this page from.
    let payload: { confirmed?: boolean; error?: string };
    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: typed, name, timezone, next }),
      });
      payload = (await res.json().catch(() => ({}))) as typeof payload;

      if (!res.ok) {
        setError(payload.error ?? 'That did not go through. Try again.');
        setBusy(false);
        return;
      }
    } catch (err) {
      setError(signUpErrorMessage(err instanceof Error ? err.message : 'Load failed'));
      setBusy(false);
      return;
    }

    // Unconfirmed means verification is switched on and the account is waiting
    // on an emailed link. Otherwise the session cookie is already set.
    if (!payload.confirmed) {
      setCheckInbox(email);
      setBusy(false);
      return;
    }

    await importGuestSessionIfAny();
    router.push(next);
    router.refresh();
  }

  if (checkInbox) {
    return (
      <div className="card px-5 py-6">
        <p className="font-display text-xl text-text">Check your inbox.</p>
        <p className="mt-2 text-sm text-muted">
          We sent a link to {checkInbox}. Click it and you are in.
        </p>
        <p className="mt-2 text-sm text-faint">
          Anything you dropped as a guest is held for a day and comes across with you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="name">
        {({ id }) => (
          <Input
            id={id}
            name="name"
            autoComplete="name"
            required
            placeholder="What should we call you?"
          />
        )}
      </Field>

      <Field label="email">
        {({ id }) => (
          <Input
            id={id}
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        )}
      </Field>

      <Field label="password" hint={`${MIN_PASSWORD_LENGTH} characters, with a symbol and a number.`}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder="••••••••••"
            onChange={(e) => setPassword(e.target.value)}
            data-testid="sign-up-password"
          />
        )}
      </Field>

      <PasswordStrength assessment={strength} />

      {error ? (
        <p role="alert" data-testid="auth-error" className="text-sm text-red">
          {error}
        </p>
      ) : null}

      <Button type="submit" full busy={busy} data-testid="sign-up-submit">
        Create account
      </Button>
    </form>
  );
}

/**
 * Anything dropped during a guest session is posted to the real account the
 * moment it exists. Guest work is never thrown away at the signup boundary.
 */
async function importGuestSessionIfAny(): Promise<void> {
  const guest = readGuestSession();
  if (!guest || guest.items.length === 0) return;

  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest.artifact),
    });
    if (res.ok) clearGuestSession();
  } catch {
    // Keep the guest snapshot on failure — Settings → Data can retry the import.
  }
}
