import type { SupabaseClient } from '@supabase/supabase-js';
import type { Group, Item, ItemEvent, UserSettings, UserStats } from '@/lib/types';
import { POINTS, advanceDailyStreak, type PointEvent } from '@/lib/gamification';
import { ApiError } from '@/lib/api';
import { log, errorFields } from '@/lib/logger';

type Db = SupabaseClient;

/**
 * Shared server-side item plumbing. Every route that touches items goes through
 * these helpers so that grouping, activity logging, points and streaks behave
 * identically no matter which surface triggered the change.
 */

/** Case-insensitive get-or-create. The DB has a unique index on (user_id, lower(name)). */
export async function ensureGroup(db: Db, userId: string, rawName: string): Promise<Group> {
  // The classifier may answer with "NEW:Travel"; the prefix is an instruction,
  // not part of the name.
  const name = rawName.replace(/^NEW:/i, '').trim().slice(0, 60);
  if (!name) throw new ApiError(400, 'A group needs a name.');

  // Matching is done in JS rather than with ilike: a group legitimately named
  // "100% done" or "a_b" contains LIKE wildcards, and a user has a handful of
  // groups, not thousands.
  const { data: groups } = await db.from('groups').select('*').eq('user_id', userId);
  const rows = (groups ?? []) as Group[];

  const existing = rows.find((group) => group.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const { data, error } = await db
    .from('groups')
    .insert({ user_id: userId, name, ai_created: true, sort_order: rows.length })
    .select('*')
    .single();

  if (error) {
    // Lost a race against a concurrent capture; the unique index on
    // (user_id, lower(name)) rejected us, so the other insert won — read it.
    const { data: raced } = await db.from('groups').select('*').eq('user_id', userId);
    const winner = ((raced ?? []) as Group[]).find(
      (group) => group.name.toLowerCase() === name.toLowerCase(),
    );
    if (winner) return winner;
    throw new ApiError(500, 'Could not make that group.');
  }

  return data as Group;
}

/** Activity timeline. Best-effort: a failed log never fails the user's action. */
export async function logEvent(
  db: Db,
  userId: string,
  itemId: string,
  kind: ItemEvent['kind'],
  from: string | null = null,
  to: string | null = null,
): Promise<void> {
  const { error } = await db.from('item_events').insert({
    item_id: itemId,
    user_id: userId,
    kind,
    from_value: from,
    to_value: to,
  });
  if (error) log.warn('item event not recorded', { userId, itemId, ...errorFields(error) });
}

export async function readStats(db: Db, userId: string): Promise<UserStats> {
  const { data } = await db.from('user_stats').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data as UserStats;

  const { data: created } = await db
    .from('user_stats')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('*')
    .single();

  return (created ?? {
    user_id: userId,
    points: 0,
    daily_streak: 0,
    last_done_date: null,
    week_streak: 0,
    last_review_at: null,
    updated_at: new Date().toISOString(),
  }) as UserStats;
}

export async function readSettings(db: Db, userId: string): Promise<UserSettings | null> {
  const { data } = await db.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  return (data as UserSettings) ?? null;
}

export async function awardPoints(db: Db, userId: string, event: PointEvent): Promise<void> {
  const stats = await readStats(db, userId);
  await db
    .from('user_stats')
    .update({ points: stats.points + POINTS[event] })
    .eq('user_id', userId);
}

/**
 * Called whenever an item transitions into `done`. Advances the daily streak in
 * the user's own timezone and adds the completion points in the same write.
 */
export async function recordCompletion(
  db: Db,
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<UserStats> {
  const stats = await readStats(db, userId);
  const streak = advanceDailyStreak(stats, now, timezone);

  const { data } = await db
    .from('user_stats')
    .update({
      points: stats.points + POINTS.done,
      daily_streak: streak.dailyStreak,
      last_done_date: streak.lastDoneDate,
    })
    .eq('user_id', userId)
    .select('*')
    .single();

  return (data as UserStats) ?? stats;
}

/** Flips one onboarding checklist key without clobbering the others. */
export async function markChecklist(db: Db, userId: string, key: string): Promise<void> {
  const { data } = await db.from('profiles').select('checklist').eq('id', userId).maybeSingle();
  const checklist = ((data?.checklist ?? {}) as Record<string, boolean>) ?? {};
  if (checklist[key]) return;

  await db
    .from('profiles')
    .update({ checklist: { ...checklist, [key]: true } })
    .eq('id', userId);
}

export async function profileTimezone(db: Db, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  return (data?.timezone as string) || 'Asia/Kolkata';
}

/** Soft delete: the row moves to trash_items and is restorable for 30 days. */
export async function trashItem(db: Db, userId: string, id: string): Promise<void> {
  const { data: item } = await db
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (!item) throw new ApiError(404, 'That item is gone.');

  // The embedding column is a pgvector value; it does not belong in JSON and is
  // recomputed on restore if embeddings are configured.
  const payload = { ...(item as Record<string, unknown>) };
  delete payload.embedding;

  await db.from('trash_items').insert({ user_id: userId, original_id: id, payload });
  const { error } = await db.from('items').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new ApiError(500, 'That did not delete.');
}

export async function restoreItem(db: Db, userId: string, originalId: string): Promise<Item> {
  const { data: row } = await db
    .from('trash_items')
    .select('*')
    .eq('user_id', userId)
    .eq('original_id', originalId)
    .order('deleted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) throw new ApiError(404, 'Nothing to restore.');

  const payload = { ...(row.payload as Record<string, unknown>) };
  delete payload.embedding;
  payload.user_id = userId;

  const { data: restored, error } = await db
    .from('items')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error || !restored) throw new ApiError(500, 'Could not bring that back.');

  await db.from('trash_items').delete().eq('id', row.id as string);
  return restored as Item;
}

/** Strips the vector column before an item is handed to the client. */
export function publicItem(row: Record<string, unknown>): Item {
  const copy = { ...row };
  delete copy.embedding;
  return copy as unknown as Item;
}

export function publicItems(rows: Record<string, unknown>[] | null): Item[] {
  return (rows ?? []).map(publicItem);
}

/** Every column of `items` except the embedding — used by every select. */
export const ITEM_COLUMNS =
  'id,user_id,group_id,title,summary,note,raw_input,type,state,priority,tags,due_at,url,url_normalized,platform,thumb_url,source,ai_status,created_at,updated_at,done_at,touched_at';
