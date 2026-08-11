import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zChecklistPatch } from '@/lib/zod-schemas';
import type { ChecklistState } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** POST /api/profile/checklist — flips one onboarding step without racing the others. */
export const POST = withUser({ route: 'profile:checklist' }, async ({ db, user, request }) => {
  const { key, value } = await parseBody(request, zChecklistPatch);

  const { data: current } = await db
    .from('profiles')
    .select('checklist')
    .eq('id', user.id)
    .maybeSingle();

  const checklist = { ...((current?.checklist ?? {}) as ChecklistState), [key]: value };

  const { data, error } = await db
    .from('profiles')
    .update({ checklist })
    .eq('id', user.id)
    .select('checklist')
    .single();

  if (error) throw error;
  return okPrivate({ checklist: (data?.checklist ?? checklist) as ChecklistState });
});
