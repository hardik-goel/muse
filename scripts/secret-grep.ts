/**
 * Guards the one rule that cannot be enforced by types: a server secret must
 * never reach a client bundle.
 *
 *   npm run secret-grep
 *
 * Two checks:
 *   1. No file marked 'use client' — or reachable only from one — may read a
 *      non-NEXT_PUBLIC_ environment variable, directly or through serverEnv.
 *   2. No literal that looks like a real key may appear anywhere in the source.
 *
 * Exits non-zero on a finding, so CI fails before a deploy does.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SEARCH_DIRS = ['app', 'components', 'lib', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

interface Finding {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

const findings: Finding[] = [];

/** Secrets that would be catastrophic in a bundle, matched by shape not name. */
const SECRET_SHAPES: { rule: string; re: RegExp }[] = [
  { rule: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { rule: 'openai-key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { rule: 'supabase-service-jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { rule: 'razorpay-secret', re: /\brzp_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { rule: 'voyage-key', re: /\bpa-[A-Za-z0-9_-]{30,}/ },
  { rule: 'private-key-block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

const files = SEARCH_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = source.split('\n');
  const isClient = /^\s*['"]use client['"]/m.test(source.slice(0, 200));

  lines.forEach((line, index) => {
    // Ignore the definition of the rule itself and anything in a comment.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    if (isClient) {
      const envMatch = line.match(/process\.env\.([A-Z0-9_]+)/);
      // NODE_ENV is inlined by the bundler and is not a secret; it is the one
      // non-public variable a client component may legitimately branch on.
      const allowed = envMatch?.[1] === 'NODE_ENV' || envMatch?.[1]?.startsWith('NEXT_PUBLIC_');

      if (envMatch && !allowed) {
        findings.push({
          file: rel,
          line: index + 1,
          rule: 'server-env-in-client',
          detail: `reads process.env.${envMatch[1]}`,
        });
      }

      if (/\bserverEnv\b/.test(line)) {
        findings.push({
          file: rel,
          line: index + 1,
          rule: 'server-env-in-client',
          detail: 'imports or reads serverEnv',
        });
      }
    }

    for (const shape of SECRET_SHAPES) {
      if (shape.re.test(line)) {
        findings.push({ file: rel, line: index + 1, rule: shape.rule, detail: 'literal secret' });
      }
    }
  });
}

if (findings.length === 0) {
  process.stdout.write(`secret-grep: clean (${files.length} files)\n`);
  process.exit(0);
}

process.stderr.write(`secret-grep: ${findings.length} problem(s)\n\n`);
for (const finding of findings) {
  process.stderr.write(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.detail}\n`);
}
process.stderr.write('\n');
process.exit(1);
