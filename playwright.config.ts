import { defineConfig, devices } from '@playwright/test';

// Deliberately not 3000. That is where every other project's `next dev` lands,
// and `reuseExistingServer` cannot tell one app's 200 from another's — point
// the suite at an occupied 3000 and it runs green-ish against a stranger.
const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The dev server compiles routes on demand and is the bottleneck, not the
  // browsers. More workers than this just queues requests behind each other.
  workers: process.env.CI ? 1 : 2,
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  // Client-side navigation to a route the dev server has not compiled yet can
  // take several seconds; 5s of default patience is not enough for a cold one.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The product is dark-only and mobile-first; default to a phone viewport.
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      // The narrow suite owns its own viewport, and RLS talks to the database
      // rather than a browser — neither is worth running per device.
      testIgnore: [/narrow\.spec\.ts/, /rls\.spec\.ts/, /signed-in\.spec\.ts/],
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/narrow\.spec\.ts/, /rls\.spec\.ts/],
    },
    {
      name: 'data',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /rls\.spec\.ts/,
    },
    {
      // 320px is the hard floor from the design spec: no horizontal scroll.
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } },
      testMatch: /narrow\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    // Wait on a route only this app serves, not on `/`. Any web server answers
    // `/` with a 200; if something else already holds the port, the health
    // probe 404s, the wait fails, and the run stops instead of testing a
    // stranger's app and reporting its 404s as our bugs.
    url: `${baseURL}/api/health`,
    // `next dev` reads PORT from its own environment, not from this config, so
    // without this it would bind 3000 while the suite talked to PORT.
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
