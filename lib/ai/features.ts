import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BriefPayload,
  Classification,
  Group,
  Item,
  Prioritisation,
  ThreadPayload,
  UserSettings,
} from '@/lib/types';
import { ITEM_STATES, ITEM_TYPES } from '@/lib/types';
import { callJson } from '@/lib/ai/anthropic';
import {
  ASK_SYSTEM,
  BRIEF_SYSTEM,
  CLASSIFY_SYSTEM,
  PRIORITIZE_SYSTEM,
  REFLECT_SYSTEM,
  THREADS_SYSTEM,
} from '@/lib/ai/prompts';
import {
  briefLocal,
  classifyLocal,
  prioritiseLocal,
  reflectLocal,
  greetingFor,
} from '@/lib/local-mode';
import { limitWords, localDayOfWeek, localHour, truncate } from '@/lib/utils';

type Db = SupabaseClient;

interface Caller {
  db: Db;
  userId: string;
  plan: 'free' | 'intelligence';
}

// ── schemas the model must satisfy ──────────────────────────────────────────

const zPriorityOut = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.null()])
  .catch(null);

const zClassification = z.object({
  title: z.string().min(1).transform((t) => limitWords(truncate(t.trim(), 160), 10)),
  summary: z
    .string()
    .default('')
    .transform((s) => limitWords(s.trim(), 18)),
  type: z.enum(ITEM_TYPES).catch('note'),
  group: z.string().min(1).max(70),
  tags: z
    .array(z.string().max(32))
    .default([])
    .transform((tags) =>
      tags
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 3),
    ),
  priority: zPriorityOut,
  state: z.enum(ITEM_STATES).catch('inbox'),
});

const zPrioritisation = z.object({
  itemId: z.string().nullable(),
  why: z.string().max(200).default(''),
  alsoConsider: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .default([])
    .transform((a) => a.slice(0, 2)),
});

const zBrief = z.object({
  greeting: z.string().max(60),
  body: z.string().max(1200),
  firstWin: z.object({ id: z.string(), title: z.string() }).nullable().default(null),
});

const zAsk = z.object({ answer: z.string().max(2000) });
const zReflect = z.object({ reflection: z.string().max(2000) });
const zThreads = z.object({
  threads: z
    .array(
      z.object({
        title: z.string().max(120),
        detail: z.string().max(600),
        itemIds: z.array(z.string()).min(1).max(4),
      }),
    )
    .default([])
    .transform((t) => t.slice(0, 3)),
});

// ── shared rendering of the library for prompts ─────────────────────────────

function itemLine(item: Item, groupName: (id: string | null) => string): string {
  const bits = [
    `id=${item.id}`,
    `title=${JSON.stringify(item.title)}`,
    `type=${item.type}`,
    `state=${item.state}`,
    `group=${JSON.stringify(groupName(item.group_id))}`,
  ];
  if (item.priority) bits.push(`priority=P${item.priority}`);
  if (item.due_at) bits.push(`due=${item.due_at.slice(0, 10)}`);
  if (item.summary) bits.push(`summary=${JSON.stringify(truncate(item.summary, 140))}`);
  if (item.tags.length) bits.push(`tags=${item.tags.join(',')}`);
  bits.push(`touched=${item.touched_at.slice(0, 10)}`);
  return bits.join(' ');
}

function namer(groups: Group[]): (id: string | null) => string {
  const byId = new Map(groups.map((g) => [g.id, g.name]));
  return (id) => (id ? (byId.get(id) ?? 'Unfiled') : 'Unfiled');
}

// ── classify ────────────────────────────────────────────────────────────────

export async function classify(
  caller: Caller,
  raw: string,
  groups: Group[],
): Promise<{ value: Classification; degraded: boolean }> {
  const local = classifyLocal(raw);
  const names = groups.map((g) => g.name);

  const result = await callJson({
    ...caller,
    feature: 'classify',
    system: CLASSIFY_SYSTEM,
    maxTokens: 500,
    schema: zClassification,
    prompt: [
      `Existing groups: ${names.length ? names.join(', ') : '(none yet)'}`,
      '',
      'The person dropped this in:',
      '"""',
      truncate(raw, 6000),
      '"""',
    ].join('\n'),
    fallback: () => local as z.infer<typeof zClassification>,
  });

  // Even a good model occasionally answers with an empty title. Local mode
  // always produces one, so borrow it rather than saving "Untitled".
  const value: Classification = {
    ...result.value,
    title: result.value.title.trim() || local.title,
    group: result.value.group.trim() || local.group,
  };

  return { value, degraded: result.degraded };
}

// ── the current ─────────────────────────────────────────────────────────────

export async function prioritise(
  caller: Caller,
  items: Item[],
  groups: Group[],
): Promise<{ value: Prioritisation; degraded: boolean }> {
  const active = items.filter((i) => i.state !== 'done');
  const local = prioritiseLocal(items);
  if (active.length === 0) return { value: local, degraded: false };

  const groupName = namer(groups);
  const candidates = active.slice(0, 40);

  const result = await callJson({
    ...caller,
    feature: 'current',
    system: PRIORITIZE_SYSTEM,
    maxTokens: 400,
    schema: zPrioritisation,
    prompt: [
      `Right now it is ${new Date().toISOString()}.`,
      '',
      'The open items:',
      ...candidates.map((item) => itemLine(item, groupName)),
    ].join('\n'),
    fallback: () => local,
  });

  // The model may name an id that is done, deleted, or invented. Anything it
  // returns has to survive a lookup against the real list.
  const known = new Set(candidates.map((i) => i.id));
  if (!result.value.itemId || !known.has(result.value.itemId)) {
    return { value: local, degraded: true };
  }

  return {
    value: {
      itemId: result.value.itemId,
      why: result.value.why.trim() || local.why,
      alsoConsider: result.value.alsoConsider.filter(
        (alt) => known.has(alt.id) && alt.id !== result.value.itemId,
      ),
    },
    degraded: result.degraded,
  };
}

// ── morning brief ───────────────────────────────────────────────────────────

export interface BriefContext {
  items: Item[];
  settings: UserSettings;
  timezone: string;
  now?: Date;
}

export async function brief(
  caller: Caller,
  context: BriefContext,
): Promise<{ value: BriefPayload; degraded: boolean }> {
  const now = context.now ?? new Date();
  const hour = localHour(now, context.timezone);
  const dayOfWeek = localDayOfWeek(now, context.timezone);

  const active = context.items.filter((i) => i.state !== 'done');
  const todos = active
    .filter((i) => i.state === 'todo')
    .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4));
  const firstWin = todos[0] ? { id: todos[0].id, title: todos[0].title } : null;

  const today = now.toDateString();
  const dueToday = active.filter(
    (i) => i.due_at && new Date(i.due_at).toDateString() === today,
  ).length;

  const workout =
    context.settings.workout_enabled && context.settings.workout_split[dayOfWeek]
      ? (context.settings.workout_split[dayOfWeek] as string)
      : null;

  const localBrief = briefLocal({
    hour,
    firstWin,
    dueToday,
    inMotion: active.filter((i) => i.state === 'doing').length,
    workoutToday: workout,
    workoutWhy: context.settings.workout_why,
  });

  const fallback = (): z.infer<typeof zBrief> => ({ ...localBrief, firstWin });

  const result = await callJson({
    ...caller,
    feature: 'brief',
    system: BRIEF_SYSTEM,
    maxTokens: 500,
    schema: zBrief,
    prompt: [
      `Local time: ${String(hour).padStart(2, '0')}:00. Suggested greeting: "${greetingFor(hour)}".`,
      `Items in motion: ${active.filter((i) => i.state === 'doing').length}.`,
      `Due today: ${dueToday}.`,
      firstWin ? `First win candidate: id=${firstWin.id} title=${JSON.stringify(firstWin.title)}` : 'No queued task.',
      workout ? `Training today: ${workout}.` : 'No training scheduled today.',
      context.settings.workout_why ? `They train because: ${context.settings.workout_why}` : '',
      '',
      'Open items:',
      ...active.slice(0, 25).map((item) => itemLine(item, () => 'Unfiled')),
    ]
      .filter(Boolean)
      .join('\n'),
    fallback,
  });

  return {
    value: {
      greeting: result.value.greeting.trim() || localBrief.greeting,
      body: result.value.body.trim() || localBrief.body,
      firstWin,
      dueToday,
      workout,
    },
    degraded: result.degraded,
  };
}

// ── ask ─────────────────────────────────────────────────────────────────────

export async function ask(
  caller: Caller,
  question: string,
  items: Item[],
  groups: Group[],
): Promise<{ value: { answer: string }; degraded: boolean }> {
  const groupName = namer(groups);

  // Cheap relevance pass so the prompt carries the items that matter rather
  // than the 40 most recent.
  const needle = question.toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  const scored = items
    .map((item) => {
      const haystack = `${item.title} ${item.summary} ${item.note} ${item.tags.join(' ')}`.toLowerCase();
      const hits = words.reduce((n, w) => (haystack.includes(w) ? n + 1 : n), 0);
      return { item, hits };
    })
    .sort((a, b) => b.hits - a.hits || new Date(b.item.touched_at).getTime() - new Date(a.item.touched_at).getTime())
    .slice(0, 40)
    .map(({ item }) => item);

  // This fallback is only reached when the model could not be asked — no key,
  // over budget, or an outage. It must not tell someone to switch on a thing
  // they have already paid for; it says what it can see and stops there.
  const localAnswer =
    scored.length === 0
      ? 'There is nothing in your library that answers that yet.'
      : `Muse could not think that through just now. The closest thing you have saved is "${scored[0]?.title}".`;

  return callJson({
    ...caller,
    feature: 'ask',
    system: ASK_SYSTEM,
    maxTokens: 600,
    schema: zAsk,
    prompt: [
      `Question: ${question}`,
      '',
      'Their library:',
      ...scored.map((item) => itemLine(item, groupName)),
    ].join('\n'),
    fallback: () => ({ answer: localAnswer }),
  });
}

// ── weekly reflection ───────────────────────────────────────────────────────

export async function reflect(
  caller: Caller,
  items: Item[],
  groups: Group[],
): Promise<{ value: { reflection: string }; degraded: boolean }> {
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const groupName = namer(groups);

  const done = items.filter(
    (i) => i.state === 'done' && i.done_at && new Date(i.done_at).getTime() >= weekAgo,
  );
  const captured = items.filter((i) => new Date(i.created_at).getTime() >= weekAgo).length;
  const inMotion = items.filter((i) => i.state === 'doing').length;
  const inboxOverdue = items.filter(
    (i) => i.state === 'inbox' && now - new Date(i.created_at).getTime() > 7 * 86_400_000,
  ).length;

  const counts = new Map<string, number>();
  for (const item of done) {
    const name = groupName(item.group_id);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const topGroup = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const local = reflectLocal({ done: done.length, captured, inMotion, inboxOverdue, topGroup });

  return callJson({
    ...caller,
    feature: 'reflect',
    system: REFLECT_SYSTEM,
    maxTokens: 500,
    schema: zReflect,
    prompt: [
      `Finished this week: ${done.length}`,
      `Captured this week: ${captured}`,
      `Still in motion: ${inMotion}`,
      `Inbox items older than a week: ${inboxOverdue}`,
      topGroup ? `Most finished work sat in: ${topGroup}` : 'Nothing was finished.',
      '',
      'Finished items:',
      ...done.slice(0, 25).map((item) => itemLine(item, groupName)),
    ].join('\n'),
    fallback: () => ({ reflection: local }),
  });
}

// ── threads ─────────────────────────────────────────────────────────────────

export async function threads(
  caller: Caller,
  items: Item[],
  groups: Group[],
): Promise<{ value: { threads: ThreadPayload[] }; degraded: boolean }> {
  const groupName = namer(groups);
  const pool = items.slice(0, 60);

  const result = await callJson({
    ...caller,
    feature: 'threads',
    system: THREADS_SYSTEM,
    maxTokens: 800,
    schema: zThreads,
    prompt: ['Their library:', ...pool.map((item) => itemLine(item, groupName))].join('\n'),
    // Threads is a genuine intelligence feature. There is no honest template
    // version of it, so Local mode shows nothing rather than something fake.
    fallback: () => ({ threads: [] }),
  });

  const known = new Set(pool.map((i) => i.id));
  const cleaned = result.value.threads
    .map((thread) => ({ ...thread, itemIds: thread.itemIds.filter((id) => known.has(id)) }))
    .filter((thread) => thread.itemIds.length >= 2);

  return { value: { threads: cleaned }, degraded: result.degraded };
}
