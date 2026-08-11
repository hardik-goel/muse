'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { relativeTime } from '@/lib/utils';

interface TokenRecord {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Siri Shortcuts and email-in.
 *
 * The plaintext token is shown exactly once, immediately after minting, and is
 * unrecoverable afterwards — only its hash is stored. That is stated on screen
 * rather than discovered later.
 */
export function ShortcutTokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [endpoint, setEndpoint] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetch('/api/capture/token')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { tokens: TokenRecord[]; endpoint: string }) => {
        if (cancelled) return;
        setTokens(data.tokens);
        setEndpoint(data.endpoint);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function mint() {
    setBusy(true);
    try {
      const res = await fetch('/api/capture/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Siri' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not make that token.');
      }
      const body = (await res.json()) as { token: string; record: TokenRecord; endpoint: string };
      setFresh(body.token);
      setEndpoint(body.endpoint);
      setTokens((current) => [body.record, ...current]);
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'That failed.', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setTokens((current) => current.filter((t) => t.id !== id));
    await fetch('/api/capture/token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
    toast.push({ message: 'Revoked.' });
  }

  return (
    <Section
      eyebrow="shortcuts"
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne"
        >
          {open ? 'Hide' : 'Set up'}
        </button>
      }
    >
      {open ? (
        <div className="card flex flex-col gap-4 px-5 py-5">
          <p className="text-sm text-muted">
            Drop things into Muse from Siri, the share sheet, or a script. Send a POST with the
            token as a bearer header.
          </p>

          <pre className="overflow-x-auto rounded-2xl border border-line bg-raised px-3.5 py-3 text-[0.6875rem] leading-relaxed text-soft">
{`POST ${endpoint || '/api/capture/token-drop'}
Authorization: Bearer <your token>
Content-Type: application/json

{ "raw": "the thing you are saving" }`}
          </pre>

          {fresh ? (
            <div className="rounded-2xl border border-champagne/40 bg-champagne-tint px-3.5 py-3">
              <p className="eyebrow text-champagne">copy it now</p>
              <p className="mt-1.5 break-all font-mono text-xs text-text">{fresh}</p>
              <p className="mt-2 text-xs text-muted">
                This is the only time it is shown. We store a hash, not the token.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(fresh);
                    toast.push({ message: 'Copied.' });
                  }}
                >
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}

          {tokens.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text">{token.label}</p>
                    <p className="text-xs text-faint">
                      {token.last_used_at
                        ? `Last used ${relativeTime(token.last_used_at)}`
                        : 'Never used'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(token.id)}
                    className="shrink-0 rounded-pill border border-red/30 bg-red-tint px-3 py-1 text-xs text-red"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <Button variant="secondary" busy={busy} onClick={() => void mint()}>
            New token
          </Button>
        </div>
      ) : null}
    </Section>
  );
}
