import type { Classification, Item, ItemState, ItemType, Prioritisation } from '@/lib/types';
import { detectPlatform, extractUrl } from '@/lib/url';
import { limitWords, truncate } from '@/lib/utils';

/**
 * Local mode — the free tier.
 *
 * Identical UX to Intelligence, zero AI calls, fully offline. These are pure
 * functions with no I/O so they run unchanged in the browser (guest mode,
 * offline capture) and on the server (free-plan capture, AI fallback).
 *
 * Every constant below is fixed by the product spec. Do not tune them.
 */

// ── classifier ──────────────────────────────────────────────────────────────

const TYPE_TO_GROUP: Record<ItemType, string> = {
  music: 'Music',
  poetry: 'Poetry',
  learning: 'AI Learning',
  idea: 'Product Ideas',
  task: 'Personal',
  note: 'Personal',
};

/** Fitness is a keyword bucket, not an item type; it maps straight to a group. */
const FITNESS_RE =
  /\b(workout|gym|lift(?:ing)?|squat|deadlift|bench|cardio|run(?:ning)?|yoga|pull-?ups?|push-?ups?|reps?|sets?|protein|macros|training|hypertrophy|mobility)\b/i;

const KEYWORD_RULES: { type: ItemType; re: RegExp }[] = [
  {
    type: 'music',
    re: /\b(song|album|track|playlist|artist|band|lyrics?|melody|remix|ep\b|listen)\b/i,
  },
  {
    type: 'poetry',
    re: /\b(poem|poetry|verse|stanza|haiku|sonnet|prose|couplet)\b/i,
  },
  {
    type: 'learning',
    re: /\b(learn|study|course|tutorial|paper|research|read about|understand|lecture|docs?|documentation|transformer|model|llm|ai\b|machine learning)\b/i,
  },
  {
    type: 'idea',
    re: /\b(idea|what if|concept|build (?:a|an)|product|feature|startup|prototype|imagine)\b/i,
  },
  {
    type: 'task',
    re: /\b(todo|to-?do|remind|buy|call|email|book|pay|renew|fix|schedule|submit|send|order|cancel|deadline|by (?:mon|tue|wed|thu|fri|sat|sun)|tomorrow|tonight)\b/i,
  },
];

/** What to call a link whose own URL says nothing readable. */
const PLATFORM_LABEL: Partial<Record<string, string>> = {
  spotify: 'Spotify track',
  youtube: 'YouTube video',
  substack: 'Substack post',
  linkedin: 'LinkedIn post',
  instagram: 'Instagram post',
  x: 'Post on X',
};

/** The bit of a hostname worth showing: no "www.", no trailing dot. */
function host(parsed: URL): string {
  return parsed.hostname.replace(/^www\./i, '');
}

/** Path segments that are routing furniture, never a name for the thing. */
const PATH_FURNITURE =
  /^(watch|abs|pdf|track|album|playlist|artist|episode|video|status|post|posts|p|s|e|d|item|index|home|view|share|embed|dp|gp)$/i;

/**
 * Is this path segment words a person wrote, or an identifier a machine made?
 *
 * "the-attention-paper" is a title. "4cOdK2wGLETKBW3PvgPWqT" and "1706.03762"
 * are not, and neither is "watch". Getting this wrong is very visible: the
 * product's whole promise is that it titles things for you.
 */
function readableSlug(slug: string): boolean {
  const trimmed = slug.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (PATH_FURNITURE.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  // Several words joined by separators are almost always a human slug.
  if (words.length >= 2) return words.some((w) => /[aeiou]/i.test(w));

  const word = words[0] ?? '';
  if (!/[aeiou]/i.test(word)) return false;
  // Identifiers give themselves away: digits mixed in, or camel/base62 casing.
  if (/\d/.test(word)) return false;
  if (/[a-z]/.test(word) && /[A-Z]/.test(word)) return false;
  return true;
}

const PLATFORM_TYPE: Partial<Record<string, ItemType>> = {
  spotify: 'music',
  youtube: 'learning',
  substack: 'learning',
  linkedin: 'learning',
  instagram: 'idea',
  x: 'idea',
};

/** Removes links from a line, leaving the prose around them. */
function stripUrls(line: string): string {
  return line.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** First line of real prose becomes the title. Nothing clever, and never empty. */
export function deriveTitle(raw: string, platform: string | null): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // A link pasted on the same line as a note is the commonest capture shape.
  // Without stripping it, the title becomes "Read the paper https://arxiv.org/…",
  // which is neither readable nor a title.
  const firstProse = lines.map(stripUrls).find(Boolean);
  if (firstProse) return limitWords(truncate(firstProse, 120), 10);

  // Pure-URL drop: build something readable out of the link itself.
  const url = extractUrl(raw);
  if (url) {
    try {
      const parsed = new URL(url);
      const slug = parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, ' ')
        .replace(/\.\w{2,4}$/, '')
        .trim();
      if (slug && readableSlug(slug)) {
        return limitWords(slug.replace(/\b\w/g, (c) => c.toUpperCase()), 10);
      }
      // The slug was an identifier, not words. Naming the kind of thing beats
      // showing "4cOdK2wGLETKBW3PvgPWqT" and calling it a title.
      if (platform && PLATFORM_LABEL[platform]) return PLATFORM_LABEL[platform] as string;
      // "web" is the catch-all detectPlatform returns for everything it does not
      // recognise, and "Saved from Web" tells the user nothing they did not
      // already know. The host does: "Saved from arxiv.org".
      const named = platform && platform !== 'web';
      const label = named ? platform[0]?.toUpperCase() + platform.slice(1) : host(parsed);
      return `Saved from ${label}`;
    } catch {
      /* fall through */
    }
  }

  return limitWords(truncate(raw.trim(), 120), 10) || 'Untitled';
}

export function classifyLocal(raw: string): Classification {
  const text = raw.trim();
  const url = extractUrl(text);
  const platform = detectPlatform(url);

  let type: ItemType = 'note';

  // Platform is the strongest signal available offline; keywords refine it.
  if (platform && PLATFORM_TYPE[platform]) {
    type = PLATFORM_TYPE[platform] as ItemType;
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) {
      type = rule.type;
      break;
    }
  }

  const isFitness = FITNESS_RE.test(text);
  const group = isFitness ? 'Fitness' : TYPE_TO_GROUP[type];

  const title = deriveTitle(text, platform);

  // Summary is the next 18 words of real content after the title, never a
  // fabrication — Local mode does not invent meaning it cannot read.
  const remainder = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .map(stripUrls)
    .filter(Boolean)
    .join(' ')
    .slice(title.length)
    .trim();
  const summary = remainder ? limitWords(remainder, 18) : '';

  const state: ItemState = type === 'task' ? 'todo' : 'inbox';

  return {
    title,
    summary,
    type,
    group,
    tags: deriveTags(text, platform, isFitness),
    priority: derivePriority(text),
    state,
  };
}

function deriveTags(text: string, platform: string | null, isFitness: boolean): string[] {
  const tags: string[] = [];
  if (platform && platform !== 'web') tags.push(platform);
  if (isFitness) tags.push('fitness');

  const hashtags = text.match(/(?:^|\s)#([\w-]{2,24})/g);
  if (hashtags) {
    for (const raw of hashtags.slice(0, 3)) {
      const tag = raw.trim().slice(1).toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.slice(0, 3);
}

function derivePriority(text: string): 1 | 2 | 3 | null {
  if (/\b(urgent|asap|today|critical|p1)\b/i.test(text)) return 1;
  if (/\b(soon|this week|important|p2)\b/i.test(text)) return 2;
  if (/\b(someday|eventually|maybe|p3)\b/i.test(text)) return 3;
  return null;
}

// ── prioritiser ─────────────────────────────────────────────────────────────

const BASE_SCORE: Record<ItemState, number> = {
  doing: 55,
  todo: 32,
  inbox: 15,
  someday: 0,
  done: 0,
};

const PRIORITY_BONUS: Record<1 | 2 | 3, number> = { 1: 30, 2: 18, 3: 8 };

export const REASONS = {
  inMotion: 'Already in motion — finish it',
  dueSoon: 'Due date approaching',
  p1: 'Marked P1',
  queue: 'Next by queue order',
} as const;

export interface ScoredItem {
  item: Item;
  score: number;
  reason: string;
}

/**
 * The Local-mode score. Higher is more urgent. Mirrors the spec exactly:
 *   base:      doing 55 · todo 32 · inbox 15
 *   priority:  P1 +30 · P2 +18 · P3 +8
 *   due:       ≤1d +30 · ≤3d +20 · ≤7d +10
 *   idle:      doing items gain min(12, idleDays × 2)
 *   stale:     inbox items older than 7 days lose 5
 */
export function scoreItem(item: Item, now: Date = new Date()): number {
  let score = BASE_SCORE[item.state];

  if (item.priority) score += PRIORITY_BONUS[item.priority];

  if (item.due_at) {
    const daysToDue = (new Date(item.due_at).getTime() - now.getTime()) / 86_400_000;
    if (daysToDue <= 1) score += 30;
    else if (daysToDue <= 3) score += 20;
    else if (daysToDue <= 7) score += 10;
  }

  if (item.state === 'doing') {
    const idleDays = Math.floor((now.getTime() - new Date(item.touched_at).getTime()) / 86_400_000);
    if (idleDays > 0) score += Math.min(12, idleDays * 2);
  }

  if (item.state === 'inbox') {
    const ageDays = Math.floor((now.getTime() - new Date(item.created_at).getTime()) / 86_400_000);
    if (ageDays > 7) score -= 5;
  }

  return score;
}

export function reasonFor(item: Item, now: Date = new Date()): string {
  if (item.state === 'doing') return REASONS.inMotion;

  if (item.due_at) {
    const daysToDue = (new Date(item.due_at).getTime() - now.getTime()) / 86_400_000;
    if (daysToDue <= 7) return REASONS.dueSoon;
  }

  if (item.priority === 1) return REASONS.p1;
  return REASONS.queue;
}

export function rankLocal(items: Item[], now: Date = new Date()): ScoredItem[] {
  return items
    .filter((i) => i.state !== 'done')
    .map((item) => ({ item, score: scoreItem(item, now), reason: reasonFor(item, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreak: the thing that has waited longest goes first.
      return new Date(a.item.touched_at).getTime() - new Date(b.item.touched_at).getTime();
    });
}

/**
 * Local-mode equivalent of The Current: pick one, say why, offer two more.
 *
 * Selection is not simply "highest score". Finish-before-you-start is a product
 * rule, not an emergent property of the weights: a fresh P1 todo scores 62
 * against a doing item's 55, and would otherwise pull the user off the thing
 * they already started. So if anything is in motion, the best in-motion item
 * wins. The raw score still drives Library sorting and the Up-next queue, where
 * ranking by urgency alone is the right answer.
 */
export function prioritiseLocal(items: Item[], now: Date = new Date()): Prioritisation {
  const ranked = rankLocal(items, now);
  if (ranked.length === 0) {
    return { itemId: null, why: 'Nothing is waiting on you. Rare air.', alsoConsider: [] };
  }

  const inMotion = ranked.filter(({ item }) => item.state === 'doing');
  const chosen = inMotion[0] ?? ranked[0];
  if (!chosen) {
    return { itemId: null, why: 'Nothing is waiting on you. Rare air.', alsoConsider: [] };
  }

  return {
    itemId: chosen.item.id,
    why: chosen.reason,
    alsoConsider: ranked
      .filter(({ item }) => item.id !== chosen.item.id)
      .slice(0, 2)
      .map(({ item }) => ({ id: item.id, title: item.title })),
  };
}

// ── templates ───────────────────────────────────────────────────────────────

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up.';
  if (hour < 12) return 'Morning.';
  if (hour < 17) return 'Afternoon.';
  if (hour < 22) return 'Evening.';
  return 'Late one.';
}

export interface LocalBriefInput {
  hour: number;
  firstWin: { id: string; title: string } | null;
  dueToday: number;
  inMotion: number;
  workoutToday: string | null;
  workoutWhy: string;
}

/** Template brief. No emojis, at most one exclamation — same rules as the AI. */
export function briefLocal(input: LocalBriefInput): { greeting: string; body: string } {
  const greeting = greetingFor(input.hour);
  const lines: string[] = [];

  if (input.firstWin) {
    lines.push(`Start with "${input.firstWin.title}". That is your first win today.`);
  } else if (input.inMotion > 0) {
    lines.push(`${input.inMotion} in motion. Finish one before you start anything new.`);
  } else {
    lines.push('Nothing queued. Drop something in and it will be waiting tomorrow.');
  }

  if (input.dueToday > 0) {
    lines.push(`${input.dueToday} due today.`);
  }

  if (input.workoutToday) {
    if (/^rest$/i.test(input.workoutToday)) {
      lines.push('Rest day. Recovery is training too.');
    } else {
      // People write their reason as a sentence, full stop and all. Appending
      // ours to theirs produces "I said I would.. That does not change".
      const why = input.workoutWhy.trim().replace(/[.!?]+$/, '');
      lines.push(
        why
          ? `${input.workoutToday} today. You said: ${why}. That does not change because today is inconvenient.`
          : `${input.workoutToday} today.`,
      );
    }
  }

  return { greeting, body: lines.join(' ') };
}

export interface LocalReflectInput {
  done: number;
  captured: number;
  inMotion: number;
  inboxOverdue: number;
  topGroup: string | null;
}

/** Template weekly reflection. States facts, offers no flattery. */
export function reflectLocal(input: LocalReflectInput): string {
  const parts: string[] = [];

  parts.push(
    input.done === 0
      ? 'Nothing finished this week.'
      : `You finished ${input.done} ${input.done === 1 ? 'thing' : 'things'} this week.`,
  );

  if (input.topGroup) parts.push(`Most of it sat in ${input.topGroup}.`);
  parts.push(`${input.captured} came in, ${input.inMotion} are still in motion.`);

  if (input.inboxOverdue > 0) {
    parts.push(
      `${input.inboxOverdue} ${input.inboxOverdue === 1 ? 'item has' : 'items have'} been in the inbox over a week. Decide on them or let them go.`,
    );
  } else {
    parts.push('The inbox is current.');
  }

  return parts.join(' ');
}
