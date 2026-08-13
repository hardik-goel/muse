import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { requireDatabase, retryTransient } from './helpers';

/**
 * The signed-in product, in a real browser, against a real database.
 *
 * This is the only place the authenticated shell, the settings screen and the
 * trash are proven to render rather than merely compile, so an absent database
 * fails the suite rather than quietly standing it down. MUSE_SKIP_DB_TESTS=1
 * is the deliberate opt-out for a machine with no Supabase.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const EMAIL = process.env.SEED_EMAIL ?? 'you@muse.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'muse-dev-password';

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

// These share one seeded account and one database; running them against each
// other buys nothing and makes the dev server the bottleneck.
test.describe.configure({ mode: 'serial' });

test.describe('signed in', () => {
  requireDatabase(
    missing,
    'Run `npm run db:start && npm run db:seed`, then load the keys with `set -a; . ./.env.local; set +a`.',
  );

  test.beforeEach(async ({ page, context, baseURL }) => {
    // requireDatabase has already failed the run with the actionable message;
    // this hook still executes, so leave rather than pile on.
    if (missing.length > 0) return;

    const client = createClient(URL_, ANON, { auth: { persistSession: false } });

    // signInWithPassword resolves with { error } rather than rejecting, so the
    // retry only engages if a transient failure is re-thrown. A genuinely
    // missing seed account is a broken rig, not a reason to report success.
    const { data, error } = await retryTransient(async () => {
      const result = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (result.error && /timed out|timeout|fetch failed/i.test(result.error.message)) {
        throw result.error;
      }
      return result;
    });
    if (error) {
      throw new Error(
        `Could not sign in as ${EMAIL} (${error.message}). Run \`npm run db:seed\` first.`,
      );
    }

    const ref = new globalThis.URL(URL_).hostname.split('.')[0];

    // Scope the cookie to whatever host the suite is pointed at, so this runs
    // against a deployment as readily as against localhost.
    await context.addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: `base64-${Buffer.from(JSON.stringify(data.session)).toString('base64')}`,
        url: baseURL ?? 'http://127.0.0.1:3000',
      },
    ]);
  });

  async function open(page: import('@playwright/test').Page, path: string) {
    await page.goto(path);
    await expect(page.locator('[data-shell-ready="true"]')).toBeAttached({ timeout: 20_000 });
  }

  test('Now renders the seeded library', async ({ page }) => {
    await open(page, '/now');

    await expect(page.getByTestId('morning-brief')).toBeVisible();
    await expect(page.getByTestId('the-current')).toBeVisible();
    await expect(page.getByTestId('item-card').first()).toBeVisible();
  });

  test('a drop persists across a reload', async ({ page }) => {
    await open(page, '/now');

    const text = `browser drop ${Date.now()}`;
    await page.getByTestId('drop-fab').click();
    await page.getByTestId('capture-input').fill(text);

    // Wait on the write itself rather than on the sheet closing. The sheet
    // closes only after the request resolves, and on a cold dev server that
    // route can take longer than any sensible UI timeout — which says nothing
    // about whether the capture worked.
    const captured = page.waitForResponse(
      (res) => res.url().includes('/api/capture') && res.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await page.getByTestId('capture-submit').click();
    expect((await captured).status()).toBe(200);
    await expect(page.getByTestId('capture-input')).toBeHidden();

    await open(page, '/library');
    await expect(page.locator('[data-library-ready="true"]')).toBeAttached();
    await page.getByTestId('library-search').fill(text);
    await expect(page.getByTestId('item-card')).toHaveCount(1);


    // And it is really in the database, not just in the store.
    await page.reload();
    await expect(page.locator('[data-shell-ready="true"]')).toBeAttached();
    await expect(page.getByText(text)).toBeVisible();
  });

  test('Library, Pulse, Settings and Trash all render', async ({ page }) => {
    await open(page, '/library');
    await expect(page.getByTestId('library-search')).toBeVisible();

    await open(page, '/pulse');
    await expect(page.getByTestId('momentum')).toBeVisible();
    await expect(page.getByTestId('reflection')).toBeVisible();

    await open(page, '/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('sign-out')).toBeVisible();

    await open(page, '/trash');
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
  });

  test('an item opens, edits and saves', async ({ page }) => {
    await open(page, '/library');

    await page.getByTestId('item-card').first().getByRole('link').first().click();
    // The detail route may still be compiling on a cold dev server.
    await expect(page).toHaveURL(/\/item\//, { timeout: 30_000 });
    await expect(page.getByLabel('notes')).toBeVisible();

    const note = `edited ${Date.now()}`;
    await page.getByLabel('notes').fill(note);

    // Wait for the write to land before navigating: reloading mid-request
    // aborts the fetch, which would make this test lie about persistence.
    const saved = page.waitForResponse(
      (res) => res.url().includes('/api/items/') && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await saved).status()).toBe(200);

    await page.reload();
    await expect(page.locator('[data-shell-ready="true"]')).toBeAttached();
    await expect(page.getByLabel('notes')).toHaveValue(note);
  });

  test('a signed-in visitor is not sent to the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/now/);
  });
});
