import { expect, test } from '@playwright/test';
import { drop, openApp } from './helpers';

/**
 * Guest mode end to end.
 *
 * This is the only suite that needs no database and no account, which makes it
 * the one that must always pass — it proves the whole product loop (capture →
 * classify → rank → change state → review) works on Local mode alone.
 */

test.describe('guest', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/guest/now');
  });

  test('says plainly that nothing is saved', async ({ page }) => {
    await expect(page.getByTestId('guest-banner')).toContainText('nothing is saved');
    await expect(page.getByRole('link', { name: 'Keep it' })).toBeVisible();
  });

  test('a drop is titled, filed and on screen', async ({ page }) => {
    await drop(page, 'Read the attention paper properly\nhttps://arxiv.org/abs/1706.03762');

    const card = page.getByTestId('item-card').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Read the attention paper');
    // Classified, not dumped in a bucket: Local mode files this as learning.
    await expect(card).toContainText('AI Learning');
  });

  test('a second identical drop is caught as a duplicate', async ({ page }) => {
    await drop(page, 'https://example.com/the-same-thing');

    await page.getByTestId('drop-fab').click();
    await page.getByTestId('capture-input').fill('https://example.com/the-same-thing');
    await page.getByTestId('capture-submit').click();

    await expect(page.getByTestId('duplicate-card')).toBeVisible();
    await page.getByTestId('dupe-skip').click();

    await expect(page.getByTestId('duplicate-card')).toBeHidden();
    await expect(page.getByTestId('item-card')).toHaveCount(1);
  });

  test('The Current names one thing once there is a task', async ({ page }) => {
    await drop(page, 'Todo: pay the electricity bill, urgent');

    const current = page.getByTestId('the-current');
    await expect(current).toBeVisible();
    await expect(current).toContainText('pay the electricity bill');
  });

  test('tapping the state pill advances inbox to to do', async ({ page }) => {
    await drop(page, 'A thought worth keeping');

    const pill = page.getByTestId('item-card').first().getByRole('button', { name: /^State:/ });
    await expect(pill).toContainText('inbox');

    await pill.click();
    await expect(pill).toContainText('to do');
  });

  test('a state change can be undone from the toast', async ({ page }) => {
    await drop(page, 'Something I might change my mind about');

    const pill = page.getByTestId('item-card').first().getByRole('button', { name: /^State:/ });
    await pill.click();
    await expect(pill).toContainText('to do');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(pill).toContainText('inbox');
  });

  test('work survives a reload inside the session', async ({ page }) => {
    await drop(page, 'Survives a refresh');
    await expect(page.getByTestId('item-card').first()).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-shell-ready="true"]')).toBeAttached();
    // The Current promotes it too, so scope the assertion to the card.
    await expect(page.getByTestId('item-card').first()).toContainText('Survives a refresh');
  });

  test('the library filters and searches', async ({ page }) => {
    await drop(page, 'A song I want to remember');
    await drop(page, 'Todo: renew the domain');

    await openApp(page, '/guest/library');
    await expect(page.locator('[data-library-ready="true"]')).toBeAttached();
    await expect(page.getByTestId('item-card')).toHaveCount(2);

    await page.getByTestId('library-search').fill('domain');
    await expect(page.getByTestId('item-card')).toHaveCount(1);

    await page.getByTestId('library-search').fill('nothing matches this');
    await expect(page.getByText('Nothing matches that.')).toBeVisible();
  });

  test('the weekly review walks the inbox one decision at a time', async ({ page }) => {
    await drop(page, 'Something to decide about');

    await openApp(page, '/guest/pulse');
    await page.getByTestId('start-review').click();

    await page.getByTestId('review-todo').click();
    await expect(page.getByTestId('review-complete')).toBeVisible();
    await page.getByTestId('review-complete').click();

    await expect(page.getByTestId('review-complete')).toBeHidden();
  });

  test('guest mode never talks to the item API', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) calls.push(url.pathname);
    });

    await drop(page, 'Nothing about this should leave the tab');
    await expect(page.getByTestId('item-card').first()).toBeVisible();

    expect(calls).toEqual([]);
  });

  test('signing up is offered the whole way through', async ({ page }) => {
    await drop(page, 'Worth keeping');
    await page.getByRole('link', { name: 'Keep it' }).click();

    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.getByTestId('sign-up-submit')).toBeVisible();
  });
});
