'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { Button } from '@/components/ui/Button';

const DURATIONS = [15, 25, 50] as const;
type Duration = (typeof DURATIONS)[number];

/**
 * Focus Session — fullscreen, wine-dark, one thing.
 *
 * The timer is driven off a wall-clock deadline rather than an accumulating
 * counter, so backgrounding the tab (which throttles intervals) does not make
 * the session drift.
 */
export function FocusSession({
  itemId,
  onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  const { items, setState, guest } = useStore();
  const item = items.find((i) => i.id === itemId) ?? null;

  const [minutes, setMinutes] = useState<Duration>(25);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(minutes * 60);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!itemId) {
      setDeadline(null);
      setPaused(false);
      setFinished(false);
      setRemaining(minutes * 60);
    }
  }, [itemId, minutes]);

  useEffect(() => {
    if (deadline === null || paused) return;

    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setFinished(true);
        setDeadline(null);
      }
    };

    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, paused]);

  const start = useCallback(async () => {
    setDeadline(Date.now() + minutes * 60 * 1000);
    setPaused(false);
    setFinished(false);

    if (!guest && itemId) {
      try {
        const res = await fetch('/api/focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, minutes }),
        });
        if (res.ok) {
          const body = (await res.json()) as { sessionId: string };
          sessionId.current = body.sessionId;
        }
      } catch {
        // A session that is not recorded still runs. The timer is the product.
      }
    }
  }, [minutes, guest, itemId]);

  const finish = useCallback(
    async (completed: boolean) => {
      if (!guest && sessionId.current) {
        void fetch('/api/focus', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId.current, completed }),
        }).catch(() => undefined);
        sessionId.current = null;
      }
      onClose();
    },
    [guest, onClose],
  );

  if (!itemId || !item) return null;

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus session"
      data-testid="focus-session"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-wine px-6 text-center"
    >
      <p className="eyebrow text-champagne/60">focus</p>
      <h2 className="mt-3 max-w-[22ch] font-display text-[clamp(1.5rem,7vw,2.25rem)] leading-tight text-text">
        {item.title}
      </h2>

      {finished ? (
        <>
          <p className="mt-10 font-display text-[clamp(4rem,22vw,8rem)] leading-none text-green">
            time.
          </p>
          <div className="mt-10 flex flex-col gap-2.5">
            <Button
              onClick={() => {
                void setState(item.id, 'done');
                void finish(true);
              }}
            >
              Mark it done
            </Button>
            <Button variant="ghost" onClick={() => void finish(true)}>
              Not yet
            </Button>
          </div>
        </>
      ) : deadline === null && !paused ? (
        <>
          <div className="mt-9 flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setMinutes(d);
                  setRemaining(d * 60);
                }}
                aria-pressed={minutes === d}
                className={`rounded-pill border px-4 py-2 font-mono text-sm ${
                  minutes === d
                    ? 'border-champagne/50 bg-champagne-tint text-champagne'
                    : 'border-line text-soft'
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
          <Button className="mt-8" onClick={() => void start()}>
            Begin
          </Button>
          <p className="mt-6 max-w-[26ch] text-sm text-soft">One thing. Nothing else exists.</p>
        </>
      ) : (
        <>
          <p
            className="mt-9 font-mono text-[clamp(3.5rem,20vw,7rem)] leading-none tabular-nums text-text"
            aria-live="off"
          >
            {mm}:{ss}
          </p>
          <div className="mt-8 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (paused) {
                  setDeadline(Date.now() + remaining * 1000);
                  setPaused(false);
                } else {
                  setPaused(true);
                  setDeadline(null);
                }
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="ghost" onClick={() => void finish(false)}>
              Leave
            </Button>
          </div>
          <p className="mt-6 max-w-[28ch] text-sm text-soft">
            Leaving costs nothing but the moment.
          </p>
        </>
      )}
    </div>
  );
}
