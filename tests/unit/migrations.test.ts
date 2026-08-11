import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The schema has exactly one copy.
 *
 * `db/migrations/` is where the files live and where the README points readers.
 * `supabase/migrations/` is where the Supabase CLI looks, and it is a symlink
 * to the former — `supabase db reset` reads nothing else. If someone ever
 * replaces that link with a copy, the two will drift and the database a
 * developer gets stops being the one the repo describes. That fails here.
 */

const REAL_DIR = join(process.cwd(), 'db/migrations');
const CLI_DIR = join(process.cwd(), 'supabase/migrations');

const EXPECTED = [
  '0001_extensions.sql',
  '0002_core.sql',
  '0003_habit.sql',
  '0004_platform.sql',
  '0005_rls.sql',
  '0006_functions.sql',
  '0007_storage.sql',
];

describe('migrations', () => {
  it('are exposed to the CLI by symlink, not by a second copy', () => {
    const stat = lstatSync(CLI_DIR);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(readlinkSync(CLI_DIR)).toBe('../db/migrations');
  });

  it('apply in a stable, documented order', () => {
    const files = readdirSync(REAL_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(files).toEqual(EXPECTED);
  });

  it('enable and force RLS on every user-owned table', () => {
    const rls = readFileSync(join(REAL_DIR, '0005_rls.sql'), 'utf8');

    const created = ['0002_core.sql', '0003_habit.sql', '0004_platform.sql']
      .map((name) => readFileSync(join(REAL_DIR, name), 'utf8'))
      .join('\n')
      .matchAll(/create table if not exists public\.(\w+)/g);

    for (const match of created) {
      const table = match[1] as string;
      expect(rls.includes(`'${table}'`) || rls.includes(`public.${table}`), table).toBe(true);
    }

    expect(rls).toContain('force row level security');
  });

  it('grant DML to the roles the app actually connects as', () => {
    const rls = readFileSync(join(REAL_DIR, '0005_rls.sql'), 'utf8');

    // RLS filters rows; without a GRANT the request fails with "permission
    // denied" before any policy is consulted. Both are required.
    expect(rls).toContain('grant select, insert, update, delete');
    expect(rls).toContain('to authenticated');
    expect(rls).toContain('to service_role');
    expect(rls).toContain('grant usage, select on all sequences');
    expect(rls).toContain('alter default privileges');
  });

  it('never assume storage-service columns that may not exist yet', () => {
    const storage = readFileSync(join(REAL_DIR, '0007_storage.sql'), 'utf8');

    // `public`, `file_size_limit` and `allowed_mime_types` are added by the
    // storage service's own migrations, which run after ours on a fresh stack.
    expect(storage).toContain('insert into storage.buckets (id, name)');
    expect(storage).toContain('information_schema.columns');
    expect(storage).not.toMatch(/insert into storage\.buckets\s*\([^)]*public/);
  });
});
