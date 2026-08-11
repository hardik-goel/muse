'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'muse.install.dismissed';

/**
 * The install nudge, shown once and never again after it is dismissed.
 *
 * Installing genuinely changes the product — the share sheet, the shortcut, the
 * notification permission all depend on it — so it is worth one prompt. It is
 * not worth two.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISSED_KEY)) return;
    // Already installed: the prompt would be nonsense.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!event) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* private mode; the prompt simply returns next session */
    }
    setEvent(null);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;

    if (choice.outcome === 'accepted') {
      void fetch('/api/profile/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'install_app', value: true }),
      }).catch(() => undefined);
    }

    dismiss();
  }

  return (
    <section className="card flex items-center justify-between gap-3 px-5 py-4" data-testid="install-prompt">
      <div className="min-w-0">
        <p className="eyebrow">install</p>
        <p className="mt-1 font-display text-lg leading-snug text-text">
          Put Muse on your home screen.
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Share things straight into it, and get the morning brief.
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="sm" onClick={() => void install()}>
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
