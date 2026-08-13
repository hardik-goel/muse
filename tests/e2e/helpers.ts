import { expect, test, type Page } from '@playwright/test';

/**
 * Guards a suite that cannot run without a database.
 *
 * These suites used to skip themselves whenever Supabase was absent, which
 * reads identically to passing in a summary line: a run could report "56
 * passed" while the only tests that touch auth, persistence and row level
 * security had quietly stood down. Absent configuration is now a failure, and
 * a developer who genuinely has no database opts out by name.
 */
export function requireDatabase(missing: string[], remedy: string): void {
  if (missing.length === 0) return;

  if (process.env.MUSE_SKIP_DB_TESTS === '1') {
    test.skip(true, `MUSE_SKIP_DB_TESTS=1 — not running: missing ${missing.join(', ')}.`);
    return;
  }

  test.beforeAll(() => {
    throw new Error(
      `This suite needs a database and none is configured (missing ${missing.join(', ')}).\n` +
        `${remedy}\n` +
        'To run without one on purpose, set MUSE_SKIP_DB_TESTS=1.',
    );
  });
}

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

/**
 * Retries an operation that failed for transient reasons only.
 *
 * The local GoTrue container answers slowly while it is warming up or while
 * several workers hit it at once, and returns "Processing this request timed
 * out". That is a property of the test rig, not of the product — but a real
 * rejection (bad credentials, a policy denial) must still fail immediately, or
 * the suite would paper over exactly what it exists to catch.
 */
export async function retryTransient<T>(
  operation: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let last: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /timed out|timeout|fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|503|504/i.test(
          message,
        );
      if (!transient || attempt === attempts) throw error;

      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw last;
}
