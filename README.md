# Muse.

**Everything you find, one calm place.**

Muse is a capture-first personal library. You drop in a link, a photo, or a
half-formed thought; Muse titles it, files it, and then tells you which one
thing to do next — and why. Organising is the product's job, not yours.

It is a Next.js 15 App Router application on Supabase Postgres, with an optional
Anthropic-powered "Intelligence" tier layered on top of a free tier that is a
complete product on its own.

---

## Table of contents

- [What it does](#what-it-does)
- [The two tiers](#the-two-tiers)
- [Quick start](#quick-start)
- [Environment](#environment)
- [Everyday commands](#everyday-commands)
- [Using the product](#using-the-product)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API surface](#api-surface)
- [AI layer](#ai-layer)
- [Security model](#security-model)
- [Scheduled jobs](#scheduled-jobs)
- [PWA and offline](#pwa-and-offline)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design system](#design-system)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)

---

## What it does

**Capture is the whole promise.** Hitting *Drop it in* writes the item before
the request returns. Classification happens afterwards and patches the row. If
the classifier is slow, over budget, broken, or not configured at all, the item
is still there — titled, filed and editable. A drop never costs you your words.

The product is three tabs:

| Tab | What it answers |
| --- | --- |
| **Now** | What does today ask of me, in what order? Morning Brief, The Current, in-motion queue, the archive rotation. |
| **Library** | Where is that thing I saved? Search, group/state/type filters, four sort orders, bulk actions, Ask Muse. |
| **Pulse** | What actually happened? Streaks, points, flow by state, per-group progress, the weekly review, Threads. |

Around those: guest mode, focus sessions, duplicate detection, a 30-day trash,
web push nudges, Siri/shortcut capture tokens, full export and import, and hard
account deletion.

### The rules the product keeps

These are behavioural commitments, not implementation details — they are
asserted in tests and they are why several pieces of code look the way they do.

1. **A capture is never lost.** Written before the response; queued locally when
   offline; replayed with an idempotency key when the network returns.
2. **AI is an upgrade, never a dependency.** Every AI feature has a
   deterministic Local-mode answer that is already on screen before the model is
   asked. A failure degrades quietly; it never shows an error.
3. **Finish before you start.** Anything already in `doing` beats a newer, more
   urgent item when picking The Current — in the scoring rules and in the prompt.
4. **A lapsed plan locks nothing.** Cancelling returns you to Local mode with
   every item intact, readable, editable and exportable.
5. **Guest mode touches no server.** Not one request. A test asserts it.
6. **Your data is yours.** One-file export, the same file imports back, and
   delete means delete.

---

## The two tiers

| | **Local** (free) | **Intelligence** (₹299/mo) |
| --- | --- | --- |
| Capture, groups, states, tags | ✅ | ✅ |
| Titles, types, filing | Rules + keywords (`lib/local-mode.ts`) | Claude reads what you wrote |
| The Current | Deterministic score | Reasoned, with an explanation |
| Morning Brief | Template | Written for the day you are having |
| Ask Muse | — | ✅ |
| Threads | — | ✅ |
| Weekly reflection | Template | Written |
| Duplicate detection | URL + title overlap | ...plus semantic (cosine > 0.9) |
| Works offline | ✅ | Falls back to Local |

Local mode is not a trial. It is the same UI, the same interactions, and the
same data — with a rules engine where the model would be.

---

## Quick start

**Requirements:** Node 20.11+, Docker (for local Supabase), and the Supabase
CLI (installed as a dev dependency).

```bash
git clone <this repo> muse && cd muse
npm install

cp .env.example .env.local        # runs as-is; no API keys required

npm run db:start                  # boots local Supabase in Docker
npm run db:reset                  # applies db/migrations/*.sql
```

`supabase start` prints an anon key and a service-role key (or run
`npx supabase status -o env`). Paste both into `.env.local`, then:

```bash
npm run db:seed                   # one confirmed account + a realistic library
npm run dev                       # http://localhost:3000
```

The local stack runs Postgres, Auth, PostgREST, Storage and Mailpit. Studio,
Realtime and Edge Functions are switched off in `supabase/config.toml` —
Realtime and Edge Functions are genuinely unused, and Studio is off because the
extra containers make `supabase start` miss its health-check window on smaller
machines. Turn Studio back on there if you want the table browser on :54323.

Sign in with **`you@muse.test` / `muse-dev-password`**, or click **Look around
first** on the landing page to use guest mode with no account at all.

With no `ANTHROPIC_API_KEY`, `MOCK_AI` is forced on and every AI route returns
its Local-mode answer. The whole product works. To exercise the Intelligence
paths, add a key, set `MOCK_AI=false`, and start the 14-day trial from
**/plans** (no card needed, and no billing keys required).

---

## Environment

Every variable is documented in [`.env.example`](.env.example). The short
version of what is required versus optional:

| Group | Required? | Effect when absent |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | The app cannot authenticate. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side | Cron, webhooks, token-drop and account deletion are disabled (503). |
| `ANTHROPIC_API_KEY` | No | `MOCK_AI` forces on; all AI features return Local mode. |
| `VOYAGE_API_KEY` | No | Embeddings skipped: no semantic duplicates, no "related" rail. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | No | Push notifications are switched off in the UI. |
| `RAZORPAY_*` | No | /plans offers the free trial only. |
| `RESEND_API_KEY` | No | The weekly digest is logged, not sent. |
| `CRON_SECRET` | For scheduled jobs | `/api/cron` returns 503. |
| `ADMIN_EMAILS` | No | `/admin` 404s for everyone. |

**The rule:** anything not prefixed `NEXT_PUBLIC_` is server-only, is read
exclusively through `serverEnv` in `lib/env.ts`, and `npm run secret-grep`
fails the build if a client component reaches for one.

---

## Everyday commands

```bash
npm run dev              # dev server
npm run build            # production build
npm run start            # serve the production build

npm run verify           # lint + typecheck + unit tests — run this before pushing
npm run lint
npm run typecheck
npm test                 # vitest, unit only — no network, no database
npm run test:e2e         # Playwright: mobile (WebKit), desktop, narrow, data
npm run smoke            # drives the authenticated API against a running app
npm run secret-grep      # fails if a secret could reach the browser

npm run db:start         # local Supabase
npm run db:reset         # re-apply all migrations from scratch
npm run db:seed          # seed account + library
npm run db:stop

npm run icons            # regenerate the PWA icon set
```

---

## Using the product

**Drop something in.** The `+` in the tab bar, or press <kbd>n</kbd>. Paste a
link, type a thought, or attach up to six images — each image becomes its own
item. *Smart* mode classifies for you; *By hand* skips the classifier entirely
when you already know what a thing is.

**Duplicates** are caught before any AI spend: exact normalised URL, then title
overlap ≥ 0.7, then (with embeddings configured) cosine ≥ 0.9. You get two
one-tap ways out.

**Move things along** by tapping the state pill: `inbox → todo → doing → done`.
Every state change is undoable for five seconds.

**Focus** on one item with a 15/25/50-minute timer. The countdown is driven off
a wall-clock deadline, so backgrounding the tab does not make it drift.

**The weekly review** walks your inbox one item at a time — *To do*, *Someday*,
*Let go*, *Keep* — and is what the review streak actually counts.

**Keyboard:** <kbd>n</kbd> new drop · <kbd>/</kbd> search · <kbd>1</kbd>
<kbd>2</kbd> <kbd>3</kbd> tabs · <kbd>Esc</kbd> close.

**Settings** holds your plan, the Intelligence switch, notification channels and
brief time, the training split, capture tokens, and export/import/delete.

**Capture from anywhere:** install the PWA and Muse appears in the OS share
sheet. For Siri or scripts, mint a token in Settings → Shortcuts and POST:

```bash
curl -X POST https://your-app/api/capture/token-drop \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"raw":"the thing you are saving"}'
```

---

## Architecture

```
Browser
├── Guest mode ─────── MemoryAdapter ──── sessionStorage      (no network, ever)
└── Signed in ──────── ApiAdapter ─────── fetch /api/*
                            │
                     StoreProvider  (optimistic writes, rollback, undo, outbox)
                            │
                    ┌───────┴────────┐
                    ▼                ▼
          Route handlers        Server Components
          (withUser wrapper)    (loadSession, loadSnapshot)
                    │                │
                    └────────┬───────┘
                             ▼
                    Supabase (RLS-scoped client)
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
   Postgres + RLS      Storage (private)      Auth (cookies)
        │
        └── after() ──▶ classifier · embeddings · events · points · streaks
                              │
                              ▼
                     Anthropic / Voyage
```

### Load-bearing decisions

**One store interface, two implementations.** `StoreAdapter` (`lib/store/`) has
exactly two implementers: `ApiAdapter` (authenticated fetch) and `MemoryAdapter`
(in-tab, classified by Local mode). Every component is written against the
interface, which is why guest mode is genuinely the same product rather than a
stripped-down demo — and why it can be proven to make zero API calls.

**Pure logic runs on both sides.** `lib/local-mode.ts`, `lib/dupe.ts`,
`lib/url.ts` and `lib/gamification.ts` have no I/O. The same `classifyLocal()`
runs in the browser for guest mode, in the browser for an offline drop, and on
the server as the AI fallback — so the three paths cannot disagree.

**Classification happens after the response.** Capture inserts the row with the
Local-mode classification and `ai_status: 'pending'`, returns, and then upgrades
it inside Next's `after()`. The card shimmers "organising…" and resolves in
place. Nothing in the write path waits on a model.

**One authentication path.** Every authenticated route goes through
`withUser()` in `lib/api.ts`, which resolves the session, applies a per-user
rate limit, shapes errors uniformly, and logs one structured line. There is no
second way in.

**Two Supabase clients, on purpose.** `supabaseServer()` carries the user's
cookie so RLS applies exactly as it would in the browser, and is the default.
`supabaseAdmin()` bypasses RLS and is used only by cron fan-out, the Razorpay
webhook, the token-drop endpoint, admin aggregates, and account deletion —
each of which scopes its own queries by `user_id` by hand.

**Optimistic with a real rollback.** `StoreProvider` snapshots the previous row
before a patch and restores exactly that on failure, rather than an
approximation. Every destructive action pushes an undoable toast.

---

## Data model

Seven migrations in `db/migrations/`, all idempotent so `supabase db reset` and
a fresh hosted project converge on the same state.

| Migration | Contents |
| --- | --- |
| `0001_extensions` | pgcrypto, pgvector, enums, `touch_updated_at` |
| `0002_core` | `profiles`, `user_settings`, `groups`, `items`, `item_events`, `trash_items` |
| `0003_habit` | `user_stats`, `reviews`, `focus_sessions`, `archive_decisions` |
| `0004_platform` | `events`, `feedback`, `feature_flags`, `push_subscriptions`, `capture_tokens`, `rate_limits`, `ai_usage_log`, `ai_cache`, calendar tables |
| `0005_rls` | RLS enabled **and forced** on every table |
| `0006_functions` | Signup bootstrap trigger, `match_items()`, retention jobs, `delete_account()` |
| `0007_storage` | Private `item-thumbs` bucket, owner-scoped policies |

`items` is the centre of gravity: the raw input is never overwritten,
`url_normalized` powers exact duplicate matching, `touched_at` drives idle
scoring and the archive rotation, and `embedding vector(1024)` is nullable
because embeddings are optional.

A trigger on `auth.users` creates `profiles` + `user_settings` + `user_stats`
atomically, so no code path ever has to handle "user exists but has no
settings".

---

## API surface

All under `app/api/`. Everything authenticated returns
`Cache-Control: private, no-store`.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/health` | GET | Public. Reports which subsystems are wired, never their values. |
| `/api/items` | GET | Filter, search, four sorts, cursor pagination. |
| `/api/items/[id]` | GET · PATCH · DELETE | GET returns item + timeline + related. DELETE is soft. |
| `/api/items/bulk` | POST | State / group / delete across up to 200 ids. |
| `/api/groups`, `/api/groups/[id]` | GET · POST · PATCH · DELETE | Case-insensitively unique per user. |
| `/api/capture` | POST | Smart Drop. Dupe check → insert → `after()` classify. |
| `/api/capture/manual` | POST | No classifier, no dupe check. |
| `/api/capture/token` | GET · POST · DELETE | Mint/revoke shortcut tokens. |
| `/api/capture/token-drop` | POST | **Public**, bearer-token authenticated. |
| `/api/trash`, `/api/trash/restore` | GET · POST · DELETE | 30-day retention. |
| `/api/upload`, `/api/thumb/[...path]` | POST · GET | Magic-byte validated; served through an authenticated proxy. |
| `/api/ai/current` · `brief` · `ask` · `reflect` · `threads` | GET/POST | 402 unless Intelligence is active. |
| `/api/review`, `/api/focus`, `/api/archive` | POST · PATCH | Habit loop: streaks, points, rotation. |
| `/api/profile`, `/api/profile/checklist`, `/api/settings` | GET · POST · PATCH | |
| `/api/import`, `/api/export` | POST · GET | Same artifact both directions. |
| `/api/push/subscribe` | GET · POST · DELETE | |
| `/api/billing/checkout` | GET · POST · DELETE | Trial or Razorpay subscription. |
| `/api/billing/webhook` | POST | **Public**, HMAC-verified. The only thing that grants a plan. |
| `/api/cron` | GET · POST | **Public**, shared-secret authenticated. |
| `/api/events`, `/api/feedback` | POST | First-party analytics; no third-party trackers exist. |
| `/api/account` | DELETE | Permanent. Requires typing `delete`. |

---

## AI layer

`lib/ai/` is the only place Anthropic is called from, and `callJson()` is the
only function that calls it. Every feature gets the same three guarantees:

1. **A fallback is always supplied.** `MOCK_AI`, a missing key, an exhausted
   budget, a malformed response, or an API error all return the caller's
   deterministic Local-mode answer with `degraded: true`.
2. **Spend is metered before it happens.** Daily per-user budgets by plan, and
   every call written to `ai_usage_log`.
3. **Output is validated, not trusted.** Zod-parsed with one reformat retry, and
   any item id the model returns is checked against the real library before it
   is used — a hallucinated id falls back rather than 404ing the user.

Expensive output is cached per local day in `ai_cache`: the Morning Brief, the
weekly reflection and Threads. The Current is deliberately uncached — a stale
"do this next" is worse than a slow one.

All prompts live in one file, `lib/ai/prompts.ts`, so the voice can be reviewed
as a whole: no emojis, at most one exclamation mark, exact item titles, and
never a claim the source text does not support.

---

## Security model

- **RLS on every table**, `FORCE`d so even the table owner cannot bypass it, and
  proven by `tests/e2e/rls.spec.ts` with two real accounts rather than by
  reading the policies.
- **Every input is Zod-parsed.** No route reads `request.json()` without a
  schema.
- **Per-user, per-scope rate limits** (general / AI / capture-token), Upstash
  when configured and Postgres otherwise, failing open with a loud log rather
  than taking the product down.
- **Capture tokens are stored as SHA-256 hashes.** The plaintext is shown once
  and is unrecoverable.
- **The Razorpay webhook is HMAC-verified over the raw body**, and the user id
  in the payload is only trusted when the stored subscription id matches.
- **Uploads are validated by magic bytes**, not by the `Content-Type` the client
  claims, and land in a private bucket served only through an authenticated
  same-origin proxy that re-checks the owner segment of the path.
- **SSRF guard** (`isSafePublicUrl`) blocks private ranges, cloud metadata
  endpoints, credentialed URLs, and IPv6 loopback/ULA/link-local — including the
  bracketed and IPv4-mapped spellings.
- **Strict CSP** with no third-party origins beyond Supabase and Razorpay
  checkout, plus `frame-ancestors 'none'`, `object-src 'none'`, and HSTS in
  production.
- **`?next=` is validated as a same-origin path** everywhere it is honoured, so
  it cannot become an open redirect.
- **Deletion is real:** storage objects swept, push subscriptions dropped, then
  the auth row removed and everything cascaded.

---

## Scheduled jobs

Configured in `vercel.json`, dispatched by `/api/cron?job=…`, authenticated with
`CRON_SECRET` compared in constant time. Each job is idempotent, because
at-least-once is the only delivery guarantee a scheduler offers — deliveries are
stamped in the `events` table so a repeat firing sends nothing twice.

| Job | Schedule | What it does |
| --- | --- | --- |
| `brief` | every 15 min | Sends each user's Morning Brief within ±7 minutes of their local `brief_time`. |
| `nudges` | hourly | At local 20:00: streak guard first, then the review nudge. At most one per person per day. |
| `digest` | Mondays | The opt-in weekly email. |
| `maintenance` | daily | Trash retention, rate-limit sweep, stale AI cache. |

---

## PWA and offline

- `public/manifest.webmanifest` — installable, with a share target and two app
  shortcuts.
- `public/sw.js` — offline fallback page, cache-first for content-hashed build
  assets, and push handling. **It never caches an API response**; personal data
  behind a cookie has no business in a cache that outlives the session.
- `lib/outbox.ts` — a capture made offline is queued in `localStorage` with a
  client-generated UUID, shown immediately (classified by the same Local-mode
  code the server would use), and replayed on `online`. The server treats that
  UUID as an idempotency key, so a replay that already landed does not
  duplicate.
- Icons are generated, not committed as opaque binaries:
  `node scripts/generate-icons.mjs`.

The service worker is not registered in development — a worker caching a build
that is about to change under it is not worth the debugging cost.

---

## Testing

```bash
npm test          # 174 unit tests, no network, no database
npm run test:e2e  # Playwright
```

**Unit** (`tests/unit/`) — 183 tests over the pure core: Local-mode
classification and scoring, duplicate detection, streaks and the archive
rotation, URL normalisation and the SSRF guard, ICS generation, the offline
outbox, JSON extraction from model output, cron time windows, image sniffing,
and the shape of the migrations themselves. No network, no database.

**Smoke** (`npm run smoke`) — 61 assertions that drive the authenticated API
end to end against a running app and a real database: capture and its duplicate
paths, idempotent replay, edit, soft delete and restore, groups, bulk actions,
focus, review, archive, settings, plan gating, export/import round-trip,
capture tokens, and the whole image pipeline including its authorisation
checks. It cleans up the rows it creates. Run `npm run dev` first.

**End-to-end** (`tests/e2e/`), four projects:

| Project | Covers |
| --- | --- |
| `mobile` (iPhone 13 / WebKit) | Full guest loop, shell, keyboard |
| `desktop` (Chrome) | The same, at desktop width |
| `narrow` (320px) | No horizontal scroll on any surface; 44px tap targets |
| `data` | RLS isolation with two real accounts (skips without a database) |
| `signed-in` (in `desktop`) | The authenticated shell, settings and trash in a real browser |

The guest suite is the one that must always pass: it needs no account and no
database, and it proves the entire product loop works on Local mode alone —
including an assertion that guest mode makes **zero** API requests.

---

## Deployment

Built for Vercel, but nothing here is Vercel-specific except `vercel.json`.

1. Create a Supabase project and run every file in `db/migrations/` in order.
2. Enable the Google provider in Supabase Auth if you want the OAuth button, and
   add `https://your-app/auth/callback` as a redirect URL.
3. Set the environment variables from [`.env.example`](.env.example) —
   `NEXT_PUBLIC_APP_URL` must be the real origin, and `CRON_SECRET` must be long
   and random.
4. Point the Razorpay webhook at `https://your-app/api/billing/webhook` and set
   `RAZORPAY_WEBHOOK_SECRET` to match.
5. Generate VAPID keys with `npx web-push generate-vapid-keys` for push.
6. Deploy. `vercel.json` registers the four cron jobs automatically.
7. Check `/api/health` — it reports which subsystems came up wired.

Feature flags (`feature_flags` table, per environment) let you pull Threads,
semantic duplicates, the email digest or bulk actions with an `UPDATE` instead
of a deploy.

---

## Design system

Dark only, by design — the palette is the brand and there is no toggle. Tokens
live in `tailwind.config.ts` and are mirrored as CSS variables in
`app/globals.css` for surfaces Tailwind does not reach.

| | |
| --- | --- |
| Ground | `#171216` bg · `#211A1F` surface · `#2A2127` raised · `#3A2E35` line |
| Text | `#F1E9DE` · `#C6B8AB` soft · `#93857B` muted · `#6E6259` faint |
| Accent | `#D8C39A` champagne · `#A05266` wine |
| Type | Instrument Serif (display) · Albert Sans (body) · IBM Plex Mono (eyebrows) |

Two surfaces are allowed to raise their voice with the wine gradient: The
Current and Momentum. Everything else stays quiet. Tints are fixed at 14% alpha.

Mobile-first with a 320px hard floor, 44px minimum tap targets, and safe-area
padding for installed PWAs.

**Voice:** a sharp friend. Direct, warm, specific. Never a cheerleader, never an
apology. No emojis, at most one exclamation mark. Error copy always says what
survived — *"Something broke on our side. Your input is safe."*

---

## Project layout

```
app/
  (app)/          signed-in shell: now, library, pulse, item, settings, trash, share
  (auth)/         sign-in, sign-up, reset
  guest/          the same product, no account, no network
  api/            every route handler
  admin/ plans/ privacy/ terms/ offline/ onboarding/
components/
  shell/          StoreProvider, AppShell, header, tab bar
  capture/        the Drop sheet, image picker, duplicate card
  items/ library/ now/ pulse/ habit/ settings/ billing/ onboarding/ pwa/
  ui/             Button, Field, Pill, Sheet, Toast, States, Wordmark
lib/
  local-mode.ts   the free tier's brain — pure functions, no I/O
  dupe.ts url.ts gamification.ts ics.ts utils.ts
  ai/             anthropic client, prompts, features, day cache
  server/         session, caller context, item helpers, jobs, flags, storage
  store/          the adapter interface and its two implementations
  supabase/       browser, server and middleware clients
db/migrations/    seven idempotent SQL files
tests/            unit (vitest) and e2e (playwright)
scripts/          secret-grep, icon generation
```

---

## Troubleshooting

**`supabase start` fails** — Docker is not running, or ports 54321–54324 are
taken. `npm run db:stop` then retry.

**Signed in but the app redirects to `/onboarding` forever** — the signup
trigger did not run. `npm run db:reset` re-applies `0006_functions.sql`.

**AI features do nothing** — expected without a key. Check `/api/health`: if
`mockAi` is `true`, every AI route is returning Local mode by design. You also
need an active plan; start the trial at `/plans`.

**Push toggle refuses to turn on** — VAPID keys are missing, or the browser has
already denied notifications for the origin (which cannot be re-prompted; it has
to be reset in browser settings).

**Images show a letter tile instead of the picture** — the thumbnail is served
through `/api/thumb/...`, which requires a session and re-checks the owner
segment of the path. A signed-out tab will always fall back to the tile.

**Playwright times out on the first run** — the dev server compiles routes on
demand. `tests/e2e/global-setup.ts` warms the common ones; a cold machine may
still need a second run.

**`supabase start` rolls back with a health-check timeout** — too many
containers for the machine, usually because another Supabase project is already
running. `npx supabase stop` the other one, or trim `supabase/config.toml`
further.

**`permission denied for table items`** — the database predates the grants in
`0005_rls.sql`. RLS decides which rows you see; a GRANT decides whether you may
touch the table at all, and both are required. `npm run db:reset` applies them.
