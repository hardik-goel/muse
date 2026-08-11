'use client';

import { useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { Button } from '@/components/ui/Button';

/**
 * Ask Muse rides on the search box: once you have typed a question, an "Ask"
 * affordance appears. Answers are at most four sentences, name items by their
 * exact titles, and say plainly when nothing matches.
 */
export function AskMuse({ question }: { question: string }) {
  const { aiActive } = useStore();
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askable = aiActive && question.trim().length >= 2;
  if (!askable && !answer) return null;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not answer that right now.');
      }
      const body = (await res.json()) as { answer: string };
      setAnswer(body.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {askable ? (
        <Button size="sm" variant="secondary" busy={busy} onClick={() => void ask()}>
          Ask Muse about “{question.length > 28 ? `${question.slice(0, 28)}…` : question}”
        </Button>
      ) : null}

      {answer ? (
        <div className="card px-4 py-4" data-testid="ask-answer">
          <p className="eyebrow">muse says</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-soft">{answer}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
