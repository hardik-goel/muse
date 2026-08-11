'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { supabaseBrowser } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/env';

/** Uncontrolled fields, matching SignInForm — see the note there. */
export function ResetForm({ mode }: { mode: 'request' | 'update' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();

    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent('/reset?mode=update')}`,
    });

    // The response is identical whether or not the address exists — an
    // enumeration oracle is not worth the marginally better copy.
    if (authError) setError(authError.message);
    else setSent(true);
    setBusy(false);
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const password = String(new FormData(event.currentTarget).get('password') ?? '');

    setBusy(true);
    setError(null);

    if (password.length < 8) {
      setError('Eight characters, minimum.');
      setBusy(false);
      return;
    }

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }
    router.push('/now');
    router.refresh();
  }

  if (sent) {
    return (
      <div className="card px-5 py-6">
        <p className="font-display text-xl text-text">Sent.</p>
        <p className="mt-2 text-sm text-muted">
          If that address has an account, a reset link is on its way.
        </p>
      </div>
    );
  }

  if (mode === 'update') {
    return (
      <form onSubmit={updatePassword} className="flex flex-col gap-4" noValidate>
        <Field label="new password" hint="Eight characters, minimum.">
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
          )}
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        ) : null}
        <Button type="submit" full busy={busy}>
          Save password
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={requestLink} className="flex flex-col gap-4" noValidate>
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
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
      <Button type="submit" full busy={busy}>
        Send reset link
      </Button>
    </form>
  );
}
