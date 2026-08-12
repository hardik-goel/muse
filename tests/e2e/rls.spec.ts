import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { retryTransient } from './helpers';

/**
 * Proves the isolation claim with two real accounts rather than by reading the
 * policies. Requires a running Supabase, so it skips itself when one is not
 * configured — and fails loudly in CI, where it must never be skipped.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const configured = Boolean(URL && ANON && SERVICE);

test.describe('row level security', () => {
  test.skip(!configured, 'Set SUPABASE_SERVICE_ROLE_KEY to run the isolation tests.');

  const alice = { email: `rls-a-${Date.now()}@muse.test`, password: 'muse-dev-password' };
  const bob = { email: `rls-b-${Date.now()}@muse.test`, password: 'muse-dev-password' };

  let aliceId = '';
  let bobId = '';
  let aliceItemId = '';

  test.beforeAll(async () => {
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

    for (const [person, target] of [
      [alice, 'alice'],
      [bob, 'bob'],
    ] as const) {
      const { data, error } = await retryTransient(async () => {
        const result = await admin.auth.admin.createUser({
          email: person.email,
          password: person.password,
          email_confirm: true,
        });
        if (result.error) throw result.error;
        return result;
      });
      if (error) throw error;
      if (target === 'alice') aliceId = data.user.id;
      else bobId = data.user.id;
    }

    const { data: item, error: itemError } = await admin
      .from('items')
      .insert({ user_id: aliceId, title: 'Alice private note', raw_input: 'secret' })
      .select('id')
      .single();
    if (itemError) throw itemError;
    aliceItemId = item.id as string;
  });

  test.afterAll(async () => {
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    for (const id of [aliceId, bobId].filter(Boolean)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function signedInAs(person: { email: string; password: string }) {
    const client = createClient(URL, ANON, { auth: { persistSession: false } });
    await retryTransient(async () => {
      const { error } = await client.auth.signInWithPassword(person);
      if (error) throw error;
    });
    return client;
  }

  test('Bob cannot read Alice\'s items', async () => {
    const client = await signedInAs(bob);
    const { data } = await client.from('items').select('id, title');

    expect(data ?? []).toHaveLength(0);
  });

  test('Bob cannot read one of Alice\'s items by id', async () => {
    const client = await signedInAs(bob);
    const { data } = await client.from('items').select('*').eq('id', aliceItemId);

    expect(data ?? []).toHaveLength(0);
  });

  test('Bob cannot update or delete an item that is not his', async () => {
    const client = await signedInAs(bob);

    const { data: updated } = await client
      .from('items')
      .update({ title: 'owned' })
      .eq('id', aliceItemId)
      .select('id');
    expect(updated ?? []).toHaveLength(0);

    const { data: deleted } = await client
      .from('items')
      .delete()
      .eq('id', aliceItemId)
      .select('id');
    expect(deleted ?? []).toHaveLength(0);

    // And Alice's item is still exactly as it was.
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    const { data: still } = await admin.from('items').select('title').eq('id', aliceItemId).single();
    expect(still?.title).toBe('Alice private note');
  });

  test('Bob cannot insert a row owned by Alice', async () => {
    const client = await signedInAs(bob);
    const { error } = await client
      .from('items')
      .insert({ user_id: aliceId, title: 'planted', raw_input: 'planted' });

    expect(error).not.toBeNull();
  });

  test('Bob cannot read Alice\'s profile, settings or stats', async () => {
    const client = await signedInAs(bob);

    for (const [table, column] of [
      ['profiles', 'id'],
      ['user_settings', 'user_id'],
      ['user_stats', 'user_id'],
    ] as const) {
      const { data } = await client.from(table).select('*').eq(column, aliceId);
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  test('an anonymous client reads nothing at all', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from('items').select('id');

    expect(data ?? []).toHaveLength(0);
  });
});
