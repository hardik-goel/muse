import { expect, type Page } from '@playwright/test';

/**
 * Waits for the app shell to finish hydrating.
 *
 * The server renders the FAB and the tab bar before React attaches to them, so
 * a click that arrives too early lands on a real element with no handler and
 * appears to succeed. Every test that interacts with the shell goes through
 * here first.
 */
export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[data-shell-ready="true"]')).toBeAttached({ timeout: 15_000 });
}

/** Drops one thing in and waits for it to appear. */
export async function drop(page: Page, text: string): Promise<void> {
  await page.getByTestId('drop-fab').click();
  await expect(page.getByTestId('capture-input')).toBeVisible();
  await page.getByTestId('capture-input').fill(text);
  await page.getByTestId('capture-submit').click();
  await expect(page.getByTestId('capture-input')).toBeHidden();
}
