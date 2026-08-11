import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/** Routing, gating and the keyboard surface — the frame around every screen. */

test('the landing page offers all three doors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Make an account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByTestId('guest-link')).toBeVisible();
});

test('the app is gated and remembers where you were going', async ({ page }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Flibrary/);
});

test.describe('signed-out API surface', () => {
  test('rejects rather than leaking', async ({ request }) => {
    for (const path of ['/api/items', '/api/groups', '/api/settings', '/api/export']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test('the health probe is public and reports configuration, not secrets', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);

    const body = (await res.json()) as { status: string; config: Record<string, boolean> };
    expect(body.status).toBe('ok');
    for (const value of Object.values(body.config)) {
      expect(typeof value).toBe('boolean');
    }
    expect(JSON.stringify(body)).not.toMatch(/sk-ant|service_role|eyJ/);
  });

  test('cron refuses an unauthenticated caller', async ({ request }) => {
    const res = await request.get('/api/cron?job=maintenance');
    expect([401, 503]).toContain(res.status());
  });

  test('the billing webhook refuses an unsigned payload', async ({ request }) => {
    const res = await request.post('/api/billing/webhook', {
      data: { event: 'subscription.activated' },
    });
    expect(res.status()).toBe(401);
  });

  test('a token drop with no token is refused', async ({ request }) => {
    const res = await request.post('/api/capture/token-drop', { data: { raw: 'hello' } });
    expect([401, 429, 503]).toContain(res.status());
  });
});

test('security headers are set on a normal page', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};

  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("object-src 'none'");
});

test.describe('keyboard', () => {
  test('n opens the capture sheet and Escape closes it', async ({ page }) => {
    await openApp(page, '/guest/now');

    await page.keyboard.press('n');
    await expect(page.getByTestId('capture-input')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('capture-input')).toBeHidden();
  });

  test('the number keys move between tabs', async ({ page }) => {
    await openApp(page, '/guest/now');

    await page.keyboard.press('2');
    await expect(page).toHaveURL(/\/guest\/library/);

    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/guest\/pulse/);
  });

  test('typing in a field never triggers a shortcut', async ({ page }) => {
    await openApp(page, '/guest/library');
    await page.getByTestId('library-search').fill('note');

    await expect(page.getByTestId('library-search')).toHaveValue('note');
    await expect(page.getByTestId('capture-input')).toBeHidden();
  });

  // WebKit only moves focus to links when the OS "Tab highlights each item"
  // preference is on, which is not the browser's default and not ours to set.
  test('the skip link is the first thing focus reaches', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit does not tab to links by default.');

    await openApp(page, '/guest/now');
    await page.keyboard.press('Tab');

    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});

test('an unknown route lands on the not-found page, not a stack trace', async ({ page }) => {
  await page.goto('/guest/nothing-here');
  await expect(page.getByText('Nothing lives here.')).toBeVisible();
});
