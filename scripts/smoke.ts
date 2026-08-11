/**
 * End-to-end smoke test of the authenticated API, against a running app and a
 * running Supabase.
 *
 *   npm run dev            # in one terminal
 *   npx tsx scripts/smoke.ts
 *
 * It signs in as the seeded account, drives every route a real session touches,
 * and asserts the response shape. This is the check that the browser suites
 * cannot make, because they never sign in.
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './load-env';
import { createClient } from '@supabase/supabase-js';

loadEnv();

const APP = process.env.SMOKE_APP_URL ?? 'http://127.0.0.1:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.SEED_EMAIL ?? 'you@muse.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'muse-dev-password';

let passed = 0;
const failures: string[] = [];

/** Five words from a wide pool: distinct enough that two runs never collide. */
function randomPhrase(): string {
  const words = [
    'lanterns', 'harbour', 'granite', 'orchard', 'monsoon', 'ledger', 'saffron',
    'compass', 'thicket', 'marigold', 'quarry', 'brambles', 'tundra', 'porcelain',
    'zephyr', 'cobalt', 'juniper', 'meridian', 'ravine', 'sandstone', 'wicker',
    'foxglove', 'anvil', 'lattice', 'plumage', 'ember', 'driftwood', 'kestrel',
  ];
  const picked: string[] = [];
  while (picked.length < 5) {
    const word = words[Math.floor(Math.random() * words.length)] as string;
    if (!picked.includes(word)) picked.push(word);
  }
  return picked.join(' ');
}

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}\n`);
  }
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: session, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });

  if (error || !session.session) {
    process.stderr.write(`could not sign in as ${EMAIL}: ${error?.message}\n`);
    process.stderr.write('run `npm run db:seed` first.\n');
    process.exit(1);
  }

  // The app reads its session from cookies set by @supabase/ssr. Building the
  // same cookie by hand is what lets a script talk to the real route handlers.
  // @supabase/ssr names the cookie after the first hostname label, which is
  // the project ref on a hosted URL and "127" against a local stack.
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'localhost';
  const cookieName = `sb-${projectRef}-auth-token`;
  const payload = `base64-${Buffer.from(JSON.stringify(session.session)).toString('base64')}`;
  const cookie = `${cookieName}=${payload}`;

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${APP}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  }

  process.stdout.write('\nreads\n');
  const items = await call('GET', '/api/items?state=all&limit=100');
  check('GET /api/items', items.status === 200 && Array.isArray(items.json.items), items.json);
  check(
    'items carry no embedding column',
    !JSON.stringify(items.json).includes('"embedding"'),
  );

  const groups = await call('GET', '/api/groups');
  check('GET /api/groups', groups.status === 200 && Array.isArray(groups.json.groups), groups.json);

  const settings = await call('GET', '/api/settings');
  check('GET /api/settings', settings.status === 200 && Boolean(settings.json.settings), settings.json);

  const profile = await call('GET', '/api/profile');
  check('GET /api/profile', profile.status === 200 && Boolean(profile.json.profile), profile.json);

  const trash = await call('GET', '/api/trash');
  check('GET /api/trash', trash.status === 200 && Array.isArray(trash.json.trash), trash.json);

  const billing = await call('GET', '/api/billing/checkout');
  check('GET /api/billing/checkout', billing.status === 200 && 'plan' in billing.json, billing.json);

  process.stdout.write('\ncapture\n');
  const unique = `smoke-${Date.now()}`;

  // The text has to be genuinely unlike anything a previous run left behind:
  // duplicate detection fires on 70% title-token overlap, and two sentences
  // that differ only by an id are, correctly, duplicates.
  const subject = randomPhrase();
  const dropText = `Remind me about ${subject} https://example.com/${unique}`;

  const created = await call('POST', '/api/capture', { raw: dropText });
  const item = created.json.item as Record<string, unknown> | null;
  check('POST /api/capture', created.status === 200 && Boolean(item), created.json);
  check('capture classified it as a task', item?.type === 'task', item?.type);
  check('capture gave it a group', Boolean(item?.group_id));
  check('capture normalised the url', typeof item?.url_normalized === 'string', item?.url_normalized);
  check('capture kept the raw input', String(item?.raw_input ?? '').includes(unique));

  const duplicate = await call('POST', '/api/capture', { raw: dropText });
  check(
    'a repeat drop is caught as a duplicate',
    duplicate.status === 200 && duplicate.json.item === null && Boolean(duplicate.json.duplicate),
    duplicate.json,
  );

  const forced = await call('POST', '/api/capture', { raw: dropText, force: true });
  check('force overrides the duplicate warning', Boolean(forced.json.item), forced.json);

  const clientId = crypto.randomUUID();
  const replayText = `offline replay ${randomPhrase()}`;
  const first = await call('POST', '/api/capture', { raw: replayText, clientId, force: true });
  const replay = await call('POST', '/api/capture', { raw: replayText, clientId, force: true });
  check(
    'a replayed drop is idempotent, not duplicated',
    (first.json.item as { id: string }).id === (replay.json.item as { id: string }).id,
  );

  const manual = await call('POST', '/api/capture/manual', {
    title: `manual ${unique}`,  // manual capture runs no duplicate check at all
    type: 'idea',
    groupName: 'Smoke Test',
  });
  check('POST /api/capture/manual', manual.status === 200 && Boolean(manual.json.item), manual.json);

  process.stdout.write('\nedit\n');
  const id = (item as { id: string }).id;

  const patched = await call('PATCH', `/api/items/${id}`, { state: 'doing', priority: 2 });
  check(
    'PATCH moves state and priority',
    patched.status === 200 && (patched.json.item as { state: string }).state === 'doing',
    patched.json,
  );

  const detail = await call('GET', `/api/items/${id}`);
  check('GET /api/items/[id]', detail.status === 200 && Boolean(detail.json.item), detail.json);
  check('the item has an activity timeline', Array.isArray(detail.json.events), detail.json.events);

  const done = await call('PATCH', `/api/items/${id}`, { state: 'done' });
  check('marking done sets done_at', Boolean((done.json.item as { done_at: string }).done_at));

  const statsAfter = await call('GET', '/api/settings');
  check('settings still readable after a completion', statsAfter.status === 200);

  const renamed = await call('PATCH', `/api/items/${id}`, { title: `renamed ${unique}` });
  check(
    'PATCH renames',
    (renamed.json.item as { title: string }).title === `renamed ${unique}`,
    renamed.json,
  );

  const badPatch = await call('PATCH', `/api/items/${id}`, {});
  check('an empty patch is rejected', badPatch.status === 400, badPatch.json);

  const missing = await call('PATCH', `/api/items/${crypto.randomUUID()}`, { state: 'todo' });
  check('patching an unknown id is a 404', missing.status === 404, missing.json);

  const malformed = await call('PATCH', '/api/items/not-a-uuid', { state: 'todo' });
  check('a malformed id is a 404, not a 500', malformed.status === 404, malformed.json);

  process.stdout.write('\ndelete and restore\n');
  const removed = await call('DELETE', `/api/items/${id}`);
  check('DELETE soft-deletes', removed.status === 200, removed.json);

  const trashAfter = await call('GET', '/api/trash');
  check(
    'the deleted item is in the trash',
    (trashAfter.json.trash as { originalId: string }[]).some((row) => row.originalId === id),
  );

  const restored = await call('POST', '/api/trash/restore', { id });
  check('restore brings it back', restored.status === 200 && Boolean(restored.json.item), restored.json);

  process.stdout.write('\ngroups, bulk, habit\n');
  const group = await call('POST', '/api/groups', { name: `Smoke ${unique}` });
  check('POST /api/groups', group.status === 200 && Boolean(group.json.group), group.json);

  const sameGroup = await call('POST', '/api/groups', { name: `smoke ${unique}` });
  check(
    'a group name is case-insensitively unique',
    (sameGroup.json.group as { id: string }).id === (group.json.group as { id: string }).id,
  );

  const bulk = await call('POST', '/api/items/bulk', {
    ids: [id],
    action: { kind: 'group', groupId: (group.json.group as { id: string }).id },
  });
  check('POST /api/items/bulk', bulk.status === 200 && bulk.json.affected === 1, bulk.json);

  const focus = await call('POST', '/api/focus', { itemId: id, minutes: 25 });
  check('POST /api/focus', focus.status === 200 && Boolean(focus.json.sessionId), focus.json);

  const endFocus = await call('PATCH', '/api/focus', {
    sessionId: focus.json.sessionId,
    completed: true,
  });
  check('PATCH /api/focus', endFocus.status === 200 && endFocus.json.awarded === true, endFocus.json);

  const closeTwice = await call('PATCH', '/api/focus', {
    sessionId: focus.json.sessionId,
    completed: true,
  });
  check('closing a session twice is not an error', closeTwice.status === 200, closeTwice.json);

  const review = await call('POST', '/api/review', { decisions: 3 });
  check('POST /api/review', review.status === 200 && Boolean(review.json.stats), review.json);

  const archive = await call('POST', '/api/archive', { itemId: id, decision: 'someday' });
  check('POST /api/archive', archive.status === 200, archive.json);

  const checklist = await call('POST', '/api/profile/checklist', { key: 'install_app' });
  check('POST /api/profile/checklist', checklist.status === 200, checklist.json);

  process.stdout.write('\nsettings and plan\n');
  const prefs = await call('PATCH', '/api/settings', {
    briefTime: '08:15',
    notifPrefs: { streak_guard: false },
  });
  check(
    'PATCH /api/settings writes both a scalar and a nested pref',
    (prefs.json.settings as { brief_time: string }).brief_time.startsWith('08:15') &&
      (prefs.json.settings as { notif_prefs: Record<string, boolean> }).notif_prefs.streak_guard ===
        false,
    prefs.json,
  );

  const freeAi = await call('PATCH', '/api/settings', { aiEnabled: true });
  const plan = (billing.json as { plan: string }).plan;
  check(
    'a free plan cannot switch Intelligence on',
    plan === 'intelligence' ? freeAi.status === 200 : freeAi.status === 402,
    freeAi.json,
  );

  const aiRoute = await call('GET', '/api/ai/current');
  check(
    'AI routes are gated on the plan',
    plan === 'intelligence' ? aiRoute.status === 200 : aiRoute.status === 402,
    aiRoute.json,
  );

  process.stdout.write('\ndata\n');
  const exported = await fetch(`${APP}/api/export`, { headers: { cookie } });
  const artifact = (await exported.json()) as { items: unknown[]; version: number };
  check('GET /api/export', exported.status === 200 && Array.isArray(artifact.items), artifact.version);
  check(
    'the export is a Content-Disposition attachment',
    (exported.headers.get('content-disposition') ?? '').includes('attachment'),
  );

  const reimport = await call('POST', '/api/import', artifact);
  check(
    'importing your own export adds nothing new',
    reimport.status === 200 && (reimport.json.imported as number) === 0,
    reimport.json,
  );

  const tokens = await call('POST', '/api/capture/token', { label: 'Smoke' });
  check('POST /api/capture/token', tokens.status === 200 && Boolean(tokens.json.token), tokens.json);

  const tokenDrop = await fetch(`${APP}/api/capture/token-drop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.json.token as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: `siri drop ${unique}` }),
  });
  check('POST /api/capture/token-drop with a valid token', tokenDrop.status === 200, await tokenDrop.text());

  const badToken = await fetch(`${APP}/api/capture/token-drop`, {
    method: 'POST',
    headers: { Authorization: 'Bearer nope', 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: 'should not land' }),
  });
  check('a bad capture token is refused', badToken.status === 401);

  await call('DELETE', '/api/capture/token', { id: (tokens.json.record as { id: string }).id });
  const revoked = await fetch(`${APP}/api/capture/token-drop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.json.token as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: 'after revoke' }),
  });
  check('a revoked capture token stops working', revoked.status === 401);

  const events = await call('POST', '/api/events', {
    events: [{ name: 'smoke_test', props: { ok: true } }],
  });
  check('POST /api/events', events.status === 200, events.json);

  const feedback = await call('POST', '/api/feedback', { text: `smoke ${unique}` });
  check('POST /api/feedback', feedback.status === 200, feedback.json);

  process.stdout.write('\nimages\n');
  const png = readFileSync('public/icons/icon-192.png');
  const form = new FormData();
  form.append('thumb', new Blob([png], { type: 'image/png' }), 'thumb.png');
  form.append('full', new Blob([png], { type: 'image/png' }), 'full.png');

  const upload = await fetch(`${APP}/api/upload`, { method: 'POST', headers: { cookie }, body: form });
  const uploaded = (await upload.json().catch(() => ({}))) as { thumbPath?: string };
  check('POST /api/upload', upload.status === 200 && Boolean(uploaded.thumbPath), uploaded);

  if (uploaded.thumbPath) {
    const owner = await fetch(`${APP}${uploaded.thumbPath}`, { headers: { cookie } });
    const bytes = Buffer.from(await owner.arrayBuffer());
    check('the owner gets the exact bytes back', owner.status === 200 && bytes.equals(png));

    const anon = await fetch(`${APP}${uploaded.thumbPath}`);
    check('a thumbnail is not readable without a session', anon.status === 401, anon.status);

    const foreign = uploaded.thumbPath.replace(
      /\/api\/thumb\/[^/]+\//,
      '/api/thumb/00000000-0000-4000-8000-000000000000/',
    );
    const cross = await fetch(`${APP}${foreign}`, { headers: { cookie } });
    check("a thumbnail under another user's prefix is a 404", cross.status === 404, cross.status);

    const traversal = await fetch(`${APP}/api/thumb/..%2F..%2Fetc%2Fpasswd`, { headers: { cookie } });
    check('path traversal is refused', traversal.status !== 200, traversal.status);
  }

  const fake = new FormData();
  fake.append('thumb', new Blob([Buffer.from('<svg onload=alert(1)>')], { type: 'image/png' }), 'x.png');
  const rejected = await fetch(`${APP}/api/upload`, { method: 'POST', headers: { cookie }, body: fake });
  check(
    'an upload is validated by its bytes, not its claimed type',
    rejected.status === 400,
    rejected.status,
  );

  process.stdout.write('\nvalidation and authorisation\n');
  const empty = await call('POST', '/api/capture', { raw: '   ' });
  check('an empty drop is rejected with a readable message', empty.status === 400, empty.json);

  const oversize = await call('POST', '/api/capture', { raw: 'x'.repeat(20_001) });
  check('an oversized drop is rejected', oversize.status === 400, oversize.json);

  const foreignGroup = await call('PATCH', `/api/items/${id}`, { groupId: crypto.randomUUID() });
  check('an unknown group id is rejected', foreignGroup.status === 400, foreignGroup.json);

  const noCookie = await fetch(`${APP}/api/items`);
  check('no session means 401', noCookie.status === 401);

  const cron = await fetch(`${APP}/api/cron?job=maintenance`);
  check('cron without the secret is refused', cron.status === 401 || cron.status === 503);

  // Leave the database as it was found: an accumulating pile of near-identical
  // smoke items is what makes the next run's duplicate assertions lie.
  process.stdout.write('\ncleanup\n');
  const mine = await call('GET', '/api/items?state=all&limit=100');
  const strays = (mine.json.items as { id: string; raw_input: string; title: string }[])
    .filter((row) => `${row.raw_input} ${row.title}`.includes(unique) || `${row.raw_input}`.includes(subject))
    .map((row) => row.id);

  if (strays.length > 0) {
    const cleaned = await call('POST', '/api/items/bulk', {
      ids: strays,
      action: { kind: 'delete' },
    });
    check('the run cleans up after itself', cleaned.status === 200, cleaned.json);
    await call('DELETE', '/api/trash');
  }

  process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    process.stdout.write(`\nfailures:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
    process.exit(1);
  }
}

void main();
