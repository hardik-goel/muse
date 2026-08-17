import { expect, test } from '@playwright/test';

/**
 * The tags that decide whether Muse is an app or a web page.
 *
 * iOS launched the home-screen icon into a normal Safari tab because
 * `apple-mobile-web-app-capable` was absent: Next 15 emits only the
 * standardised `mobile-web-app-capable` for `appleWebApp.capable`, and iOS
 * Safari does not read that name. Nothing in the app looked broken, which is
 * exactly why it needs a test — the failure is a meta tag that is simply not
 * there, on a platform no unit test exercises.
 */

test.describe('installability', () => {
  test('declares itself installable to both iOS and Android', async ({ page }) => {
    await page.goto('/');

    // The Apple-prefixed name is the one iOS Safari honours. Without it the
    // icon opens a browser tab.
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    // The standardised name, for Chrome and everything else.
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });

  test('the manifest asks for a standalone window and its icons exist', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);

    const manifest = (await res.json()) as {
      display: string;
      start_url: string;
      scope: string;
      icons: { src: string }[];
    };

    // `standalone` is what removes the browser chrome; `browser` would render
    // the installed app as an ordinary tab.
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url.startsWith('/')).toBe(true);
    // A start_url outside the scope silently drops the app back into a tab.
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);

    for (const icon of manifest.icons) {
      const asset = await request.get(icon.src);
      expect(asset.status(), `${icon.src} is referenced but missing`).toBe(200);
    }
  });

  test('the apple touch icon is really there', async ({ request }) => {
    const res = await request.get('/icons/apple-touch-icon.png');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  });
});
