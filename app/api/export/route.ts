import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api';
import { ITEM_COLUMNS, publicItems } from '@/lib/server/items';
import { localDate } from '@/lib/utils';
import type { Group, UserSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export — everything, in the format /api/import accepts.
 *
 * This is the promise behind "your data is yours": one file, no account
 * required to read it, and it round-trips back into a fresh account intact.
 */
export const GET = withUser({ route: 'export' }, async ({ db, user }) => {
  const [itemsRes, groupsRes, settingsRes, profileRes] = await Promise.all([
    db.from('items').select(ITEM_COLUMNS).eq('user_id', user.id).order('created_at'),
    db.from('groups').select('*').eq('user_id', user.id).order('sort_order'),
    db.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  const groups = (groupsRes.data ?? []) as Group[];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const items = publicItems(itemsRes.data as Record<string, unknown>[] | null);
  const settings = settingsRes.data as UserSettings | null;
  const timezone = (profileRes.data?.timezone as string) || 'Asia/Kolkata';

  const artifact = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      note: item.note,
      raw: item.raw_input,
      type: item.type,
      state: item.state,
      group: item.group_id ? (groupName.get(item.group_id) ?? null) : null,
      tags: item.tags,
      priority: item.priority,
      due: item.due_at,
      url: item.url,
      platform: item.platform,
      // Images stay behind their authenticated URL rather than being inlined as
      // megabytes of base64; the importer understands both.
      thumb: item.thumb_url,
      createdAt: item.created_at,
      doneAt: item.done_at,
    })),
    settings: settings
      ? {
          timezone,
          briefTime: settings.brief_time,
          workoutEnabled: settings.workout_enabled,
          workoutSplit: settings.workout_split,
          workoutWhy: settings.workout_why,
        }
      : undefined,
  };

  const filename = `muse-export-${localDate(new Date(), timezone)}.json`;

  return new NextResponse(JSON.stringify(artifact, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
