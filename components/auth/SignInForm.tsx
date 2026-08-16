'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/**
 * The fields are uncontrolled on purpose.
 *
 * The form is server-rendered and looks usable before React attaches to it.
 * With controlled inputs, anything typed in that window is discarded on the
 * first render — on a cold load over a slow connection that means watching your
 * email and password vanish. Reading the values from the form at submit time
 * cannot lose them.
 */
export function SignInForm({ next = '/now' }: { next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    setBusy(true);
    setError(null);

    // Through our own origin rather than straight to Supabase, so a browser on
    // a network that blocks supabase.co can still get in. See
    // app/api/auth/sign-in/route.ts.
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'That combination did not work.');
        setBusy(false);
        return;
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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

      <Field label="password">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="••••••••"
          />
        )}
      </Field>

      {error ? (
        <p role="alert" data-testid="auth-error" className="text-sm text-red">
          {error}
        </p>
      ) : null}

      <Button type="submit" full busy={busy} data-testid="sign-in-submit">
        Sign in
      </Button>
    </form>
  );
}
