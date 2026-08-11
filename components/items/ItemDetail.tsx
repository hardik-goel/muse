'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/shell/StoreProvider';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/States';
import { Thumb } from '@/components/items/Thumb';
import { StatePill, nextState } from '@/components/ui/Pill';
import { ITEM_STATES, ITEM_TYPES, type ItemEvent, type ItemState, type ItemType } from '@/lib/types';
import { CalendarButton } from '@/components/items/CalendarButton';
import { relativeTime } from '@/lib/utils';

interface Related {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

/**
 * The item, in full. Everything is editable here — this is where a mis-filed
 * capture gets corrected, and where an AI failure becomes a normal item again.
 */
export function ItemDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { items, groups, patchItem, deleteItem, setState, guest } = useStore();

  const item = items.find((i) => i.id === id);

  const [draft, setDraft] = useState({ title: '', summary: '', note: '' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [related, setRelated] = useState<Related[]>([]);
  const [timeline, setTimeline] = useState<ItemEvent[]>([]);

  useEffect(() => {
    if (item) {
      setDraft({ title: item.title, summary: item.summary, note: item.note });
      setDirty(false);
    }
  }, [item?.id, item]);

  useEffect(() => {
    if (guest || !item) return;
    let cancelled = false;

    fetch(`/api/items/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { related?: Related[]; events?: ItemEvent[] }) => {
        if (cancelled) return;
        setRelated(data.related ?? []);
        setTimeline(data.events ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [id, guest, item]);

  if (!item) {
    return (
      <EmptyState
        headline="That one is gone."
        hint="It may be in the trash, or it was never here."
        action={
          <Link href={guest ? '/guest/library' : '/library'} className="text-champagne">
            Back to the library
          </Link>
        }
      />
    );
  }

  async function save() {
    setSaving(true);
    await patchItem(id, {
      title: draft.title.trim() || 'Untitled',
      summary: draft.summary.trim(),
      note: draft.note,
    });
    setSaving(false);
    setDirty(false);
    toast.push({ message: 'Saved.', tone: 'good' });
  }

  async function copyLink() {
    const text = [item?.title, item?.summary, item?.url].filter(Boolean).join('\n');
    try {
      if (navigator.share) await navigator.share({ title: item?.title, text, url: item?.url ?? undefined });
      else await navigator.clipboard.writeText(text);
      toast.push({ message: 'Copied.' });
    } catch {
      // The user dismissed the share sheet. Nothing to report.
    }
  }

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Thumb item={item} size={64} />
        <div className="min-w-0 flex-1">
          <StatePill
            state={item.state}
            onClick={() => void setState(item.id, nextState(item.state))}
          />
          <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">
            {item.type} · added {relativeTime(item.created_at)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="title">
          {({ id: fieldId }) => (
            <Input
              id={fieldId}
              value={draft.title}
              maxLength={200}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }));
                setDirty(true);
              }}
            />
          )}
        </Field>

        <Field label="summary">
          {({ id: fieldId }) => (
            <Input
              id={fieldId}
              value={draft.summary}
              maxLength={400}
              onChange={(e) => {
                setDraft((d) => ({ ...d, summary: e.target.value }));
                setDirty(true);
              }}
            />
          )}
        </Field>

        <Field label="notes">
          {({ id: fieldId }) => (
            <Textarea
              id={fieldId}
              rows={6}
              value={draft.note}
              onChange={(e) => {
                setDraft((d) => ({ ...d, note: e.target.value }));
                setDirty(true);
              }}
              placeholder="Anything you want to remember about this."
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="state">
            {({ id: fieldId }) => (
              <select
                id={fieldId}
                value={item.state}
                onChange={(e) => void patchItem(id, { state: e.target.value as ItemState })}
                className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
              >
                {ITEM_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="type">
            {({ id: fieldId }) => (
              <select
                id={fieldId}
                value={item.type}
                onChange={(e) => void patchItem(id, { type: e.target.value as ItemType })}
                className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="group">
            {({ id: fieldId }) => (
              <select
                id={fieldId}
                value={item.group_id ?? ''}
                onChange={(e) => void patchItem(id, { groupId: e.target.value || null })}
                className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
              >
                <option value="">Unfiled</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="priority">
            {({ id: fieldId }) => (
              <select
                id={fieldId}
                value={item.priority ?? ''}
                onChange={(e) =>
                  void patchItem(id, {
                    priority: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null,
                  })
                }
                className="w-full rounded-2xl border border-line bg-raised px-3.5 py-3 text-text"
              >
                <option value="">None</option>
                <option value="1">P1</option>
                <option value="2">P2</option>
                <option value="3">P3</option>
              </select>
            )}
          </Field>
        </div>

        <Field label="due">
          {({ id: fieldId }) => (
            <Input
              id={fieldId}
              type="date"
              value={item.due_at ? item.due_at.slice(0, 10) : ''}
              onChange={(e) =>
                void patchItem(id, {
                  dueAt: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null,
                })
              }
            />
          )}
        </Field>

        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm text-champagne underline-offset-4 hover:underline"
          >
            {item.url}
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button busy={saving} disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
        <CalendarButton item={item} label="Add to calendar" className="h-11 px-5 text-sm" />
        <Button variant="secondary" onClick={() => void copyLink()}>
          Share
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await deleteItem(id);
            router.push(guest ? '/guest/library' : '/library');
          }}
        >
          Delete
        </Button>
      </div>

      {related.length > 0 ? (
        <section>
          <h2 className="eyebrow">related</h2>
          <div className="rail mt-2.5">
            {related.map((rel) => (
              <Link
                key={rel.id}
                href={guest ? `/guest/item/${rel.id}` : `/item/${rel.id}`}
                className="card w-56 shrink-0 px-3.5 py-3"
              >
                <p className="font-display text-base leading-snug text-text">{rel.title}</p>
                {rel.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{rel.summary}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {timeline.length > 0 ? (
        <section>
          <h2 className="eyebrow">history</h2>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {timeline.map((event) => (
              <li key={event.id} className="flex gap-2 text-xs text-muted">
                <span className="font-mono text-faint">{relativeTime(event.created_at)}</span>
                <span>
                  {event.kind === 'state'
                    ? `${event.from_value ?? '—'} → ${event.to_value ?? '—'}`
                    : event.kind}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item.raw_input && item.raw_input !== item.title ? (
        <section>
          <h2 className="eyebrow">as you dropped it</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-line bg-raised px-3.5 py-3 text-xs leading-relaxed text-muted">
            {item.raw_input}
          </p>
        </section>
      ) : null}
    </article>
  );
}
