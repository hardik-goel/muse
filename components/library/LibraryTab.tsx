'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/components/shell/StoreProvider';
import { ItemCard } from '@/components/items/ItemCard';
import { Chip } from '@/components/ui/Pill';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { AskMuse } from '@/components/library/AskMuse';
import { BulkBar } from '@/components/library/BulkBar';
import { ITEM_STATES, ITEM_TYPES, type ItemState, type ItemType } from '@/lib/types';
import { scoreItem } from '@/lib/local-mode';

type StateFilter = 'active' | 'all' | ItemState;
type SortKey = 'score' | 'newest' | 'oldest' | 'due';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'due', label: 'Due' },
];

export function LibraryTab() {
  const { items, groups, loading, createGroup, flags } = useStore();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [state, setState] = useState<StateFilter>('active');
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  // "/" from anywhere in the app lands here with the cursor already in the box.
  useEffect(() => {
    if (searchParams.get('focus') === 'search') searchRef.current?.focus();
  }, [searchParams]);

  // The input is server-rendered and interactive-looking before React attaches
  // to it. Anything typed in that window sits in the DOM while `query` is still
  // empty, so the list would not filter and the keystrokes would be silently
  // discarded on the first re-render. Adopt them instead.
  useEffect(() => {
    const typed = searchRef.current?.value ?? '';
    if (typed) setQuery(typed);
    setReady(true);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (state === 'active') {
        if (item.state === 'done') return false;
      } else if (state !== 'all' && item.state !== state) {
        return false;
      }
      if (group && item.group_id !== group) return false;
      if (type !== 'all' && item.type !== type) return false;

      if (needle) {
        const haystack =
          `${item.title} ${item.summary} ${item.note} ${item.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    const now = new Date();
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'due': {
          // Undated items sink; among dated ones the soonest floats.
          if (!a.due_at && !b.due_at) return 0;
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        }
        case 'score':
        default:
          return scoreItem(b, now) - scoreItem(a, now);
      }
    });
  }, [items, query, group, state, type, sort]);

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addGroup() {
    const name = window.prompt('Name the group');
    if (name?.trim()) await createGroup(name.trim());
  }

  const selecting = selected.size > 0;

  return (
    <div className="flex flex-col gap-4" data-library-ready={ready ? 'true' : 'false'}>
      <h1 className="sr-only">Library</h1>
      <div className="flex gap-2">
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything"
          aria-label="Search your library"
          data-testid="library-search"
        />
      </div>

      <AskMuse question={query} />

      <div className="rail" role="group" aria-label="Groups">
        <Chip active={group === null} onClick={() => setGroup(null)}>
          All
        </Chip>
        {groups.map((g) => (
          <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
            {g.name}
          </Chip>
        ))}
        <Chip onClick={() => void addGroup()}>+ group</Chip>
      </div>

      <div className="rail" role="group" aria-label="States">
        <Chip active={state === 'active'} onClick={() => setState('active')}>
          Active
        </Chip>
        {ITEM_STATES.map((s) => (
          <Chip key={s} active={state === s} onClick={() => setState(s)}>
            {s}
          </Chip>
        ))}
        <Chip active={state === 'all'} onClick={() => setState('all')}>
          All
        </Chip>
      </div>

      <div className="rail" role="group" aria-label="Types">
        <Chip active={type === 'all'} onClick={() => setType('all')}>
          Any type
        </Chip>
        {ITEM_TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {t}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </span>
        <div className="flex gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={`rounded-pill px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-eyebrow transition-colors ${
                sort === s.key ? 'bg-champagne-tint text-champagne' : 'text-faint hover:text-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          headline={query ? 'Nothing matches that.' : 'This shelf is empty.'}
          hint={
            query
              ? 'Try fewer words, or search the whole library.'
              : 'Drop something in and it lands here.'
          }
          action={
            query ? (
              <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selectable={selecting || Boolean(flags.bulk_actions)}
              selected={selected.has(item.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <BulkBar selected={selected} onClear={() => setSelected(new Set())} />
    </div>
  );
}
