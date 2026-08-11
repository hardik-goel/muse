import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { z } from 'zod';
import { zOnboarding } from '@/lib/zod-schemas';
import { INTERESTS, type Profile } from '@/lib/types';
import { ensureGroup } from '@/lib/server/items';

export const dynamic = 'force-dynamic';

const zProfilePatch = z
  .object({
    name: z.string().trim().min(1).max(80),
    timezone: z.string().min(1).max(64),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const GET = withUser({ route: 'profile:get' }, async ({ db, user }) => {
  const { data } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) throw new ApiError(404, 'No profile yet.');
  return okPrivate({ profile: data as Profile });
});

export const PATCH = withUser({ route: 'profile:patch' }, async ({ db, user, request }) => {
  const patch = await parseBody(request, zProfilePatch);

  const { data, error } = await db
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  return okPrivate({ profile: data as Profile });
});

/**
 * POST /api/profile — completes onboarding.
 *
 * Three questions, once. Answering them pre-creates the groups the person said
 * they care about, so the library is never an empty grid on day one, and turns
 * on the workout habit if they said they train.
 */
export const POST = withUser({ route: 'profile:onboard' }, async ({ db, user, request }) => {
  const input = await parseBody(request, zOnboarding);

  const known = new Set(INTERESTS.map((i) => i.key));
  const interests = input.interests.filter((key) => known.has(key));

  const profileUpdate: Record<string, unknown> = {
    interests,
    onboarded: true,
  };
  if (input.timezone) profileUpdate.timezone = input.timezone;

  const { data, error } = await db
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw new ApiError(500, 'Could not save that.');

  for (const key of interests) {
    const interest = INTERESTS.find((i) => i.key === key);
    if (interest) await ensureGroup(db, user.id, interest.group);
  }

  if (input.trains) {
    await ensureGroup(db, user.id, 'Fitness');
    await db
      .from('user_settings')
      .update({ workout_enabled: true, workout_why: input.why })
      .eq('user_id', user.id);
  }

  return okPrivate({ profile: data as Profile });
});
