'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/States';
import { Sheet } from '@/components/ui/Sheet';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * Your data is yours: one file out, the same file back in, and a delete that
 * actually deletes. The delete requires typing the word — a modal alone is too
 * easy to click through on a phone.
 */
export function DataSection() {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function importFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const artifact: unknown = JSON.parse(text);

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(artifact),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'That file would not import.');
      }

      const body = (await res.json()) as { imported: number; skipped: number };
      toast.push({
        message: `${body.imported} in, ${body.skipped} already here.`,
        tone: 'good',
      });
      router.refresh();
    } catch (err) {
      toast.push({
        message: err instanceof Error ? err.message : 'That file would not import.',
        tone: 'bad',
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'delete' }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not delete the account.');
      }

      window.location.href = '/';
    } catch (err) {
      toast.push({
        message: err instanceof Error ? err.message : 'Could not delete the account.',
        tone: 'bad',
      });
      setBusy(false);
    }
  }

  return (
    <Section eyebrow="your data">
      <div className="card flex flex-col gap-2 px-5 py-5">
        <p className="text-sm text-muted">
          Everything you have dropped in, as one file. It reads back into any Muse account.
        </p>

        <div className="mt-1 flex flex-wrap gap-2">
          <a
            href="/api/export"
            download
            className="inline-flex h-11 items-center rounded-pill border border-line bg-raised px-5 text-sm text-text transition-colors hover:border-champagne/40"
          >
            Export
          </a>

          <Button variant="secondary" busy={busy} onClick={() => fileRef.current?.click()}>
            Import
          </Button>

          <Link
            href="/trash"
            className="inline-flex h-11 items-center rounded-pill border border-line bg-raised px-5 text-sm text-text transition-colors hover:border-champagne/40"
          >
            Trash
          </Link>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />

        <div className="mt-4 border-t border-line pt-4">
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
          <p className="mt-2 text-xs text-faint">
            Permanent. Export first if there is anything here you want.
          </p>
        </div>
      </div>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="This cannot be undone."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-soft">
            Every item, group, note and image goes. There is no restore, and support cannot bring
            it back either.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">type delete to confirm</span>
            <Input
              value={confirmText}
              autoComplete="off"
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
            />
          </label>

          <Button
            variant="danger"
            full
            busy={busy}
            disabled={confirmText.trim().toLowerCase() !== 'delete'}
            onClick={() => void deleteAccount()}
          >
            Delete everything
          </Button>
          <Button variant="ghost" full onClick={() => setDeleteOpen(false)}>
            Keep my account
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}
