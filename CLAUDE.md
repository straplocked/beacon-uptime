# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server on port 3100 (NOT 3000)
npm run worker           # BullMQ worker — monitor checks + notification delivery
npm run scheduler        # 15s scheduling loop + heartbeat watchdog + retention cleanup
npm run lint             # eslint
npm run build            # next build + typecheck the worker via tsconfig.worker.json
```

All three processes must run for monitoring to actually work locally. `npm run dev` alone gives you a dashboard with stale data.

### Tests

```bash
npm test                                      # vitest run (node env, src/**/*.test.ts only)
npx vitest run src/lib/monitoring/evaluator.test.ts    # single file
npx vitest run -t "blocks link-local"         # single test by name
npm run test:coverage                         # coverage over src/lib/** (db/queue/stripe excluded)
```

Tests are unit-only and live beside their source. No DB or Redis needed.

### Database

```bash
docker compose up -d db redis                 # db on host 5433, redis on host 6380
npm run db:generate                           # generate migration from schema.ts changes
npm run db:migrate                            # apply migrations + TimescaleDB setup (scripts/migrate.ts)
npm run db:seed                               # demo data: demo@beacon.local / password123
npm run db:load-test-seed                     # bulk data for perf testing
```

`DATABASE_URL` must be in the environment for every `db:*` script — they read it directly, not from `.env.local`:

```bash
DATABASE_URL=postgresql://beacon:beacon@localhost:5433/beacon npm run db:migrate
```

`db:migrate` is not plain drizzle-kit. `scripts/migrate.ts` also creates the timescaledb extension, converts `check_results` to a hypertable, and creates the `hourly_uptime` / `daily_uptime` continuous aggregates. Each step is individually wrapped in try/catch because `CREATE EXTENSION timescaledb` restarts the Postgres server and drops the connection (ECONNRESET) on a fresh volume — the script sleeps 5s and reconnects. Re-running is safe and expected.

## Architecture

### Three processes, one codebase

| Process | Entry | Role |
|---|---|---|
| Next.js | `src/app` | dashboard, all API routes, public status pages |
| Worker | `src/worker/index.ts` | consumes `monitor-checks` and `notifications` queues |
| Scheduler | `src/worker/scheduler.ts` | enqueues due checks every 15s, flags overdue heartbeats, runs retention cleanup every 240 ticks (~1h) |

`src/worker/**` is **excluded from `tsconfig.json`** and typechecked separately via `tsconfig.worker.json` (ES2022, no DOM lib). Worker code cannot import anything React or `next/*`. `src/lib/**` is shared by both tsconfigs, so anything added there must typecheck under both.

### The check pipeline

Scheduler finds monitors where `last_checked_at + interval_seconds <= now()` → enqueues to `monitor-checks` with a dedupe `jobId` so a slow check can't stack → worker dispatches on monitor type to `src/lib/monitoring/checks/{http,tcp,dns,ssl,ping}.ts` → result goes to `processCheckResult()` in `src/lib/monitoring/evaluator.ts`.

`evaluator.ts` is the heart of the system and the place to look first for any status/incident/alert behavior. It writes the `check_results` row, updates the monitor's status, and **only when the status actually changed** auto-creates or auto-resolves incidents and fans out to the `notifications` queue (org channels) plus subscriber emails.

Note there is no flap protection: a single failed check flips the monitor and fires alerts. There is no `failureThreshold` column and no consecutive-failure counting anywhere (the README implies otherwise). The only suppression is that transitions *out of* `pending` or `paused` are ignored, so monitor creation and un-pausing stay quiet. Heartbeat monitors bypass the worker entirely — the scheduler calls `processCheckResult()` directly with a synthetic "down" result when a ping is overdue.

Both worker and scheduler `await import()` the evaluator lazily rather than importing at module top level.

### Multi-tenancy: organizations, not users

Everything is scoped to `organizations`, not `users`. `monitors`, `status_pages`, `incidents`, `notification_channels`, and the `api_key` all hang off `organization_id`. A user reaches an org through `organization_members` (roles: `owner` / `admin` / `member` / `viewer`, gated by `src/lib/auth/permissions.ts`).

Two auth entry points, and picking the wrong one is the most common mistake:

- **`getAuthContext()`** (`src/lib/auth/index.ts`) — session cookie based, for `/api/internal/*` and dashboard pages. Returns `{ user, organization, membership, role }`. Active org comes from the `beacon_org` cookie, falling back to the user's first membership.
- **`getApiKeyOrg()` / `resolveApiKey()`** (`src/lib/auth/api-key.ts`) — resolves `Bearer bk_...` to an org, for `/api/v1/*` and `/api/mcp`. Cookies are deliberately **not** accepted on those routes (CSRF).

Route namespaces: `/api/internal/*` = session auth, `/api/v1/*` = API key, `/api/public/*` = unauthenticated (subscribe/confirm/status), `/api/mcp` = API key only.

### One edition, no plan gating

Beacon is open source only — a single, fully unlimited edition. There is no
`src/lib/edition.ts`, no `src/lib/plans.ts`, no `PLAN_LIMITS`, no Stripe and no
billing UI. Do not reintroduce a `can*` plan gate; if you find code reading
`organizations.plan` to decide whether a feature is allowed, that is a bug.

Two real limits remain and are *not* plan gates:

- `MIN_CHECK_INTERVAL_SECONDS` (30s) in `src/lib/monitoring/limits.ts` — an
  operational floor protecting the 15s scheduler loop. Enforced by both
  monitor-create routes and the MCP `create_monitor` / `update_monitor` tools
  via `clampCheckInterval()`.
- Rate limiting in `src/lib/rate-limit.ts` plus the MCP write ceiling — those
  are security controls.

Retention is one window for the whole install: `DATA_RETENTION_DAYS`
(default 365), applied by `cleanupOldData()` in `src/worker/scheduler.ts`.

Multi-tenancy is core, not premium: the org switcher and team management are
always visible, and `organization_members` roles are enforced by
`src/lib/auth/permissions.ts`.

### Outbound requests must go through safe-fetch

`src/lib/net/safe-fetch.ts` is an SSRF guard, not a convenience wrapper. Monitor targets and webhook URLs are attacker-controlled, so it resolves the host and refuses loopback, RFC1918, CGNAT, link-local (`169.254.0.0/16` — cloud metadata), and the IPv6 equivalents including `::ffff:` mapped forms. Never reach for bare `fetch()` on a user-supplied URL; use `safeFetch`. The IPv6 parser has subtle `::` zero-fill arithmetic — read its comments before touching it.

### Status page theming and brand extraction

Status pages are auto-branded. `POST /api/internal/status-pages/extract-palette` → `src/lib/color/favicon.ts` fetches the target's favicon (`ico.ts` decodes ICO/BMP by hand, sharp handles the rest), `palette.ts` clusters pixels in OKLCH to pick brand/accent/supporting swatches and suggests one of five themes. `src/lib/status-themes.ts` turns a theme + brand color into a CSS variable block injected into the page.

Color math lives in `src/lib/color/oklch.ts` (sRGB ↔ OKLab ↔ OKLCH, WCAG contrast, `ensureContrast`). Derive colors through it rather than hand-picking hex — extracted brand colors are arbitrary and contrast must hold in both light and dark.

### Design tokens

`src/app/globals.css` defines semantic tokens beyond the shadcn defaults: `--status-{up,degraded,down,paused,pending}` (each with a `-soft` variant), `--severity-{critical,major,minor,none}`, and `--incident-{investigating,identified,monitoring,resolved}`. Use these instead of raw Tailwind colors for anything status-bearing — light and dark are both first-class, and the status page themes override the same names. Fonts are Inter (`--font-sans`), JetBrains Mono (`--font-mono`), Space Grotesk (`--font-display`).

### MCP server

`POST /api/mcp` exposes 16 tools built in `src/lib/mcp/server.ts`, stateless JSON-RPC over HTTP (no SSE, no sessions). A fresh server + transport is bound to the caller's org per request. Reads share the 60-req/60s API key limit; writes get an extra 30-req/60s ceiling. Tool list is documented in `docs/MCP.md`.

## Known gotchas

- **Zod 4**: `z.record()` needs two args — `z.record(z.string(), z.string())`.
- **shadcn Select**: `onValueChange` receives `string | null`.
- **Recharts**: don't annotate the `Tooltip` formatter param — let TS infer it.
- **BullMQ + ioredis**: BullMQ bundles its own ioredis types, so the shared connection in `src/lib/queue/index.ts` is cast `as any`. Reuse that export instead of creating new clients.
- **Redis needs `maxRetriesPerRequest: null`** for BullMQ workers.
- **README drift**: the README says port 3000 and describes a user-scoped schema. Both are stale — it's 3100, and the schema is org-scoped.

## Docker compose variants

| File | Use |
|---|---|
| `docker-compose.yml` | local full stack, prebuilt image |
| `docker-compose.dev.yml` | containerized dev with `tsx --watch` (`npm run dev:docker`) |
| `docker-compose.prod.yml` | self-hosted prod: password-protected Redis, pg backup sidecar |

`entrypoint.sh` runs migrations before starting the server, so container start is migration-gated. Pushing to `main` builds and pushes to GHCR (`.github/workflows/docker-publish.yml`) — there is no test/lint CI, so run `npm test` and `npm run lint` locally before pushing.

## License

Beacon Uptime is AGPL-3.0-only (see `LICENSE`), not MIT — the earlier MIT license was never published anywhere. Contributions require signing the CLA (`CLA.md`, process in `CONTRIBUTING.md`) so the same contribution can ship in both the AGPL codebase and a possible future hosted edition; that dual grant is the whole reason the CLA exists — don't reintroduce MIT wording, a different license badge, or an unsigned-contribution path anywhere in this repo.
