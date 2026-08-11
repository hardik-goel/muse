/** Domain types shared by server and client. Kept free of any runtime imports. */

export const ITEM_TYPES = ['idea', 'learning', 'music', 'poetry', 'note', 'task'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_STATES = ['inbox', 'todo', 'doing', 'done', 'someday'] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export const CAPTURE_SOURCES = ['app', 'share', 'siri', 'email'] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export type PlanTier = 'free' | 'intelligence';
export type AiStatus = 'pending' | 'ready' | 'failed';

export type Platform =
  | 'instagram'
  | 'youtube'
  | 'spotify'
  | 'x'
  | 'linkedin'
  | 'substack'
  | 'web'
  | null;

export interface Item {
  id: string;
  user_id: string;
  group_id: string | null;
  title: string;
  summary: string;
  note: string;
  raw_input: string;
  type: ItemType;
  state: ItemState;
  priority: 1 | 2 | 3 | null;
  tags: string[];
  due_at: string | null;
  url: string | null;
  url_normalized: string | null;
  platform: Platform;
  thumb_url: string | null;
  source: CaptureSource;
  ai_status: AiStatus;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  touched_at: string;
}

/** An item that only exists in the browser (guest mode / optimistic capture). */
export type DraftItem = Omit<Item, 'user_id'> & { user_id: string | null; pending?: boolean };

export interface Group {
  id: string;
  user_id: string;
  name: string;
  ai_created: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  timezone: string;
  interests: string[];
  onboarded: boolean;
  checklist: ChecklistState;
  created_at: string;
  updated_at: string;
}

export interface ChecklistState {
  first_drop?: boolean;
  first_done?: boolean;
  first_review?: boolean;
  install_app?: boolean;
  enable_notifications?: boolean;
}

export const CHECKLIST_STEPS = [
  { key: 'first_drop', label: 'Drop your first thing' },
  { key: 'first_done', label: 'Finish one' },
  { key: 'first_review', label: 'Run a weekly review' },
  { key: 'install_app', label: 'Install the app' },
  { key: 'enable_notifications', label: 'Turn on nudges' },
] as const satisfies ReadonlyArray<{ key: keyof ChecklistState; label: string }>;

export interface NotifPrefs {
  morning_brief: boolean;
  workout: boolean;
  review_due: boolean;
  streak_guard: boolean;
  email_digest: boolean;
}

export interface UserSettings {
  user_id: string;
  plan: PlanTier;
  plan_status: 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled';
  trial_ends_at: string | null;
  current_period_end: string | null;
  ai_enabled: boolean;
  notif_master: boolean;
  notif_prefs: NotifPrefs;
  brief_time: string;
  workout_enabled: boolean;
  workout_split: string[];
  workout_why: string;
  created_at: string;
  updated_at: string;
}

export interface UserStats {
  user_id: string;
  points: number;
  daily_streak: number;
  last_done_date: string | null;
  week_streak: number;
  last_review_at: string | null;
  updated_at: string;
}

export interface ItemEvent {
  id: number;
  item_id: string;
  user_id: string;
  kind: 'created' | 'state' | 'edited' | 'group' | 'priority' | 'due' | 'ai';
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface TrashItem {
  id: string;
  user_id: string;
  original_id: string;
  payload: Item;
  deleted_at: string;
}

/** Result of the classifier — identical shape from AI and from Local mode. */
export interface Classification {
  title: string;
  summary: string;
  type: ItemType;
  group: string;
  tags: string[];
  priority: 1 | 2 | 3 | null;
  state: ItemState;
}

/** Result of the prioritiser — The Current in AI mode, rules in Local mode. */
export interface Prioritisation {
  itemId: string | null;
  why: string;
  alsoConsider: { id: string; title: string }[];
}

export interface BriefPayload {
  greeting: string;
  body: string;
  firstWin: { id: string; title: string } | null;
  dueToday: number;
  workout: string | null;
}

export interface ThreadPayload {
  title: string;
  detail: string;
  itemIds: string[];
}

export interface Interest {
  key: string;
  label: string;
  group: string;
  emptyHint: string;
}

export const INTERESTS: Interest[] = [
  { key: 'ai', label: 'AI & Tech', group: 'AI Learning', emptyHint: 'Drop a paper you keep meaning to read.' },
  { key: 'product', label: 'Product ideas', group: 'Product Ideas', emptyHint: 'That idea from the shower. Put it here.' },
  { key: 'music', label: 'Music', group: 'Music', emptyHint: 'A track you want to come back to.' },
  { key: 'writing', label: 'Poetry & Writing', group: 'Poetry', emptyHint: 'A line you liked. Even half of one.' },
  { key: 'fitness', label: 'Fitness', group: 'Fitness', emptyHint: 'A session, a lift, a thing to fix.' },
  { key: 'finance', label: 'Finance', group: 'Finance', emptyHint: 'Something to check on this month.' },
  { key: 'reading', label: 'Reading', group: 'Reading', emptyHint: 'The book you told someone about.' },
  { key: 'travel', label: 'Travel', group: 'Travel', emptyHint: 'The place you keep opening in a tab.' },
];

export const DEFAULT_WORKOUT_SPLIT = ['Push', 'Pull', 'Legs', 'Rest', 'Push', 'Pull', 'Rest'] as const;
export const DAY_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
