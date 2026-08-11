import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/**
 * 320px is the hard floor from the design spec: at the narrowest phone width
 * still in use, nothing may push the layout sideways. This runs in its own
 * Playwright project so the viewport is not inherited from the mobile preset.
 */

const PAGES = ['/', '/guest/now', '/guest/library', '/guest/pulse', '/sign-in', '/plans', '/privacy'];

for (const path of PAGES) {
  test(`no horizontal scroll at 320px: ${path}`, async ({ page }) => {
    await page.goto(path);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });

    // One pixel of slack for sub-pixel rounding in the layout engine.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}

test('the capture sheet fits at 320px', async ({ page }) => {
  await openApp(page, '/guest/now');
  await page.getByTestId('drop-fab').click();

  await expect(page.getByTestId('capture-input')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('every tap target clears 44px', async ({ page }) => {
  await openApp(page, '/guest/now');

  const targets = page.locator('nav button, nav a');
  const count = await targets.count();

  for (let i = 0; i < count; i += 1) {
    const box = await targets.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
