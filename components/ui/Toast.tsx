'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Toasts carry the undo affordance. Every destructive action in Muse — delete,
 * done, review decision, archive, clear-all — pushes one of these with a 5s
 * window and a snapshot-restoring callback.
 */

export interface ToastSpec {
  id: string;
  message: string;
  tone?: 'neutral' | 'good' | 'bad';
  /** Present => an "Undo" button is rendered and the snapshot is restored. */
  undo?: () => void | Promise<void>;
  durationMs?: number;
}

interface ToastApi {
  push: (spec: Omit<ToastSpec, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const UNDO_WINDOW_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastSpec[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (spec: Omit<ToastSpec, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = spec.durationMs ?? (spec.undo ? UNDO_WINDOW_MS : 3000);
      setToasts((current) => [...current.slice(-2), { ...spec, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[60] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-center justify-between gap-3',
              'rounded-pill border border-line bg-raised px-4 py-3 text-sm shadow-lg animate-rise',
              toast.tone === 'good' && 'border-green/30',
              toast.tone === 'bad' && 'border-red/30',
            )}
          >
            <span className="min-w-0 flex-1 text-soft">{toast.message}</span>
            {toast.undo ? (
              <button
                type="button"
                className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-champagne"
                onClick={() => {
                  void toast.undo?.();
                  dismiss(toast.id);
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
