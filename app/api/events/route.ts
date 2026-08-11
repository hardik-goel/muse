import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zEventBatch } from '@/lib/zod-schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/events — first-party analytics.
 *
 * There is no third-party tracker in this product and there never will be.
 * Events carry a name and small props; RLS makes them write-only for the user
 * who sent them, and the admin view reads aggregates through the service role.
 */
export const POST = withUser({ route: 'events' }, async ({ db, user, request }) => {
  const { events } = await parseBody(request, zEventBatch);

  const rows = events.map((event) => ({
    user_id: user.id,
    name: event.name,
    // Props are analytics dimensions, not a place to mirror item content.
    props: clampProps(event.props),
  }));

  const { error } = await db.from('events').insert(rows);
  if (error) return okPrivate({ ok: false });

  return okPrivate({ ok: true, accepted: rows.length });
});

function clampProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props).slice(0, 12)) {
    if (typeof value === 'string') out[key.slice(0, 40)] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key.slice(0, 40)] = value;
  }
  return out;
}
