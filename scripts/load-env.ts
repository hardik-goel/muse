import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads .env.local for the standalone scripts.
 *
 * Next.js does this for the app, but `tsx db/seed.ts` and `tsx scripts/smoke.ts`
 * run outside it — and a seed script that silently sees no service-role key and
 * then fails with a network timeout is a bad first five minutes for anyone
 * cloning this repo.
 *
 * Values already present in the real environment win, so CI can override.
 */
export function loadEnv(file = '.env.local'): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
