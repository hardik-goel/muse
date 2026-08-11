'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabaseBrowser } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/env';

export function GoogleButton({ next = '/now' }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        // The user's timezone is captured at signup and rides along in metadata.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" full busy={busy} onClick={signIn}>
        <GoogleGlyph />
        Continue with Google
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red">
          {error}
        </p>
      ) : null}
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}
