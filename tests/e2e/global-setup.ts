import type { FullConfig } from '@playwright/test';

/**
 * Warms the dev server before the suite starts.
 *
 * `next dev` compiles a route the first time it is requested, which can take
 * several seconds. Without this, whichever test happens to reach a route first
 * pays that cost inside its own timeout and fails for a reason that has nothing
 * to do with the product.
 */
const ROUTES = [
  '/',
  '/guest/now',
  '/guest/library',
  '/guest/pulse',
  '/sign-in',
  '/sign-up',
  '/plans',
  '/privacy',
  '/terms',
  '/api/health',
  '/api/items',
  // GET returns 405, which is fine — the point is to make Next compile the
  // module now rather than inside the first sign-in's timeout.
  '/api/auth/sign-in',
  '/api/auth/sign-up',
];

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    `http://127.0.0.1:${process.env.PORT ?? 3100}`;

  await Promise.all(
    ROUTES.map(async (route) => {
      try {
        await fetch(`${baseURL}${route}`, { redirect: 'manual' });
      } catch {
        // The server is up (Playwright waited for it); a single failed warm-up
        // is not worth failing the run over.
      }
    }),
  );
}
