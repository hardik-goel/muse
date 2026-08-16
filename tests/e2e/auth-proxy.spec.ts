import { expect, test } from '@playwright/test';
import { requireDatabase } from './helpers';

/**
 * Sign-up and sign-in go through this app's own origin.
 *
 * The point of the proxy is not that credentials work — it is *where* the
 * browser sends them. A phone on a network that could not resolve
 * `*.supabase.co` failed sign-up outright, on a build where the auth service
 * was demonstrably healthy. So the assertion that matters here is the negative
 * one: no request leaves the page for supabase.co.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

/** Unique per run, so a re-run is not "user already registered". */
function freshEmail(): string {
  return `proxy-${Date.now()}-${Math.floor(Math.random() * 10_000)}@muse.test`;
}

const PASSWORD = 'Str0ng-Test-Pass!';

test.describe('auth goes through our own origin', () => {
  requireDatabase(missing, 'Run `npm run db:start`, then `set -a; . ./.env.local; set +a`.');

  test('signing up never contacts supabase directly from the browser', async ({ page }) => {
    if (missing.length > 0) return;

    const offOrigin: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('supabase.co') || r.url().includes(':54321')) offOrigin.push(r.url());
    });

    await page.goto('/sign-up');
    await page.getByLabel('name').fill('Proxy Tester');
    await page.getByLabel('email').fill(freshEmail());
    await page.getByTestId('sign-up-password').fill(PASSWORD);

    const proxied = page.waitForResponse(
      (r) => r.url().includes('/api/auth/sign-up') && r.request().method() === 'POST',
    );
    await page.getByTestId('sign-up-submit').click();

    expect((await proxied).status()).toBe(200);
    // Confirmations are off locally, so the cookie is set and onboarding loads.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    expect(offOrigin, `browser called Supabase directly: ${offOrigin.join(', ')}`).toEqual([]);
  });

  test('a weak password is refused before anything is sent', async ({ page }) => {
    if (missing.length > 0) return;

    let posted = false;
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/sign-up')) posted = true;
    });

    await page.goto('/sign-up');
    await page.getByLabel('name').fill('Weak');
    await page.getByLabel('email').fill(freshEmail());
    await page.getByTestId('sign-up-password').fill('abc');
    await page.getByTestId('sign-up-submit').click();

    await expect(page.getByTestId('auth-error')).toBeVisible();
    expect(posted, 'a weak password should never reach the network').toBe(false);
  });

  test('signing in goes through our origin, and a wrong password says so once', async ({ page }) => {
    if (missing.length > 0) return;

    const email = freshEmail();
    await page.goto('/sign-up');
    await page.getByLabel('name').fill('Returning');
    await page.getByLabel('email').fill(email);
    await page.getByTestId('sign-up-password').fill(PASSWORD);
    await page.getByTestId('sign-up-submit').click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    await page.context().clearCookies();

    const offOrigin: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('supabase.co') || r.url().includes(':54321')) offOrigin.push(r.url());
    });

    await page.goto('/sign-in');
    await page.getByLabel('email').fill(email);
    await page.getByLabel('password').fill('wrong-password-entirely');
    await page.getByRole('button', { name: /sign in/i }).click();

    // One message for a bad password and for an unknown address alike.
    await expect(page.getByText(/do not match|did not work/i)).toBeVisible({ timeout: 15_000 });
    expect(offOrigin, `browser called Supabase directly: ${offOrigin.join(', ')}`).toEqual([]);
  });
});
