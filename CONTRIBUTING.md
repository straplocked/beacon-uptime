# Contributing to Beacon Uptime

Thanks for your interest! Beacon Uptime is a young project being actively shaped by real-world use, so contributions of every size are welcome — bug reports, docs fixes, and code.

## Before you write code

- **Bugs**: open an issue with steps to reproduce (there's a template). Small, obvious fixes can go straight to a PR.
- **Features**: open an issue first so we can agree on the approach before you invest time.
- **Security issues**: never open a public issue — see [SECURITY.md](SECURITY.md).

## Licensing: what you're agreeing to

Beacon Uptime is open source under the [AGPL-3.0](LICENSE). An official hosted edition — this codebase plus closed-source hosting components — may come later.

To keep that possible, **all contributions require signing the [Contributor License Agreement](CLA.md)** before they can be merged. In plain terms, the CLA says:

1. Your contribution is your own original work (or you have the right to submit it).
2. You keep the copyright to your contribution.
3. You give the maintainer a broad license to it — including the right to distribute it under other licenses, which is what allows your code to ship in both the AGPL edition and a hosted edition.

Signing is a one-time click via the CLA bot, which comments on your first pull request. If you're contributing on behalf of your employer, mention it in the PR so we can sort out a corporate signature.

If that arrangement isn't for you, that's completely fair — the AGPL still gives you every right to fork and build on the project independently. If you run a modified build for other people over a network, the AGPL (section 13) asks you to offer those users the source of the version they're actually using — for example, a link in your dashboard or in the status page footer.

## Development setup

You need Node.js 20 and Docker. Postgres (with TimescaleDB) and Redis run in containers; the app, worker and scheduler run on your host.

```bash
npm install
cp .env.example .env.local                  # git-ignored; never commit credentials
docker compose up -d db redis               # Postgres on host port 5433, Redis on host port 6380

export DATABASE_URL=postgresql://beacon:beacon@localhost:5433/beacon
npm run db:migrate                          # migrations + TimescaleDB setup
npm run db:seed                             # demo data — log in as demo@beacon.local / password123

npm run dev                                 # dashboard + API on http://localhost:3100
```

Things that trip people up:

- **`DATABASE_URL` must be in the environment** for every `db:*` script, and for the worker and scheduler too. They read it straight from the environment; nothing loads `.env.local` for them (only Next.js does). Export it in each terminal.
- **Monitoring needs all three processes.** `npm run dev` alone gives you a dashboard with stale data. Run these in two more terminals:

  ```bash
  npm run worker       # BullMQ worker — runs monitor checks and delivers notifications
  npm run scheduler    # enqueues due checks every 15s, flags overdue heartbeats, runs retention cleanup
  ```

- **Port 3100, not 3000.** The dev server is pinned to 3100.
- **`db:migrate` is safe to re-run.** On a fresh volume, enabling TimescaleDB restarts Postgres mid-migration; the script waits and reconnects. If it still reports an error on the very first run, run it again.
- **Schema changes**: edit `src/lib/db/schema.ts`, run `npm run db:generate`, and commit the generated migration in `src/lib/db/migrations/` together with the schema change.

## Making changes

A few project invariants — [CLAUDE.md](CLAUDE.md) explains the architecture in more depth:

- **Everything is scoped to an organization, not a user.** Monitors, status pages, incidents, notification channels and the API key all hang off `organization_id`. Every query must filter by the organization from the auth context — never by an id taken from the request body.
- **Pick the right auth entry point.** `getAuthContext()` (session cookie) is for `/api/internal/*` and dashboard pages. `getApiKeyOrg()` (`Bearer bk_...`) is for `/api/v1/*` and `/api/mcp`, which deliberately do not accept cookies (CSRF). `/api/public/*` is unauthenticated, so anything added there must be safe for anyone on the internet to call. Role checks go through `src/lib/auth/permissions.ts`.
- **Status, incident and alert behavior lives in `src/lib/monitoring/evaluator.ts`.** Start there, and don't add a second path that changes monitor status or fires notifications.
- **Worker code is its own world.** `src/worker/**` is excluded from `tsconfig.json` and typechecked with `tsconfig.worker.json` (ES2022, no DOM). Worker code cannot import React or anything from `next/*`. `src/lib/**` is shared by both configs, so anything you add there must typecheck under both.
- **New outbound requests to user-supplied URLs go through [`src/lib/net/safe-fetch.ts`](src/lib/net/safe-fetch.ts).** It is an SSRF guard, not a convenience wrapper: it refuses loopback, private, CGNAT and link-local ranges (including cloud metadata) and their IPv6 forms, and re-checks every redirect hop. New code that fetches a URL a user typed in uses `safeFetch`, never bare `fetch()`. Read the comments before touching its IPv6 parsing.
- **Status colours come from the semantic design tokens.** Use `--status-{up,degraded,down,paused,pending}` (each with a `-soft` variant), `--severity-*` and `--incident-*` from `src/app/globals.css` — or the primitives in `src/components/dashboard/status-indicators.tsx` — never raw Tailwind colours for anything status-bearing. Light and dark are both first-class, and status page themes override the same token names. Derive brand-dependent colours through `src/lib/color/oklch.ts` so contrast holds in both modes.
- **New source files carry the licence header** — two lines at the top, matching the file's comment syntax:

  ```
  // SPDX-License-Identifier: AGPL-3.0-only
  // Copyright (C) 2026 Chris Carvache
  ```

  Keep your own copyright line on files you author (the CLA covers the licensing, not the authorship). Existing files get their headers in one separate sweep, so don't add headers to files you're only editing. Generated files (such as the Drizzle migrations) get no header, and vendored third-party code keeps its own license and gets no header.

## Tests, lint and typecheck

There is no test or lint CI yet — the only workflow builds and publishes the Docker image on pushes to `main` and version tags. That makes running these locally before you open a PR essential.

**Tests** are unit-only and need no database or Redis. They live beside the code they test (`evaluator.ts` → `evaluator.test.ts`):

```bash
npm test                                                # the whole suite
npx vitest run src/lib/monitoring/evaluator.test.ts     # one file
npx vitest run -t "rejects when ANY resolved address"   # one test by name
npm run test:coverage                                   # coverage over src/lib/**
```

New behavior and bug fixes need test coverage — especially anything touching the evaluator, auth, organization scoping, or `safe-fetch`.

**Lint**:

```bash
npm run lint
```

The lint baseline currently has pre-existing problems. The rule is simple: **don't add new ones.** Compare against `main`, or run `npx eslint <files you touched>`.

**Build and typecheck**:

```bash
npx next build                        # production build; typechecks the app (tsconfig.json)
npx tsc -p tsconfig.worker.json       # typechecks src/worker/** and src/lib/** as the worker sees them
```

The worker typecheck has a few known errors in `src/lib/monitoring/checks/ssl.test.ts` mocks; as with lint, add no new ones. Use the two commands above rather than `npm run build` for now: its `build:worker` step starts the worker process instead of typechecking it and does not exit on its own.

## Commit messages

Use the conventional prefixes already in the history, with an optional scope, in the imperative:

```
feat: enqueue immediate check on monitor create and unpause
feat(incidents): collaboration UI + acknowledge
fix: remove static jobId from BullMQ enqueue to fix check intervals
docs: add README, API reference, and architecture documentation
```

`feat`, `fix`, `docs` and `chore` cover most changes; `refactor` and `test` are used too. PRs are squash-merged, so the PR title becomes the commit on `main` — give it the same shape.

## Pull requests

A good PR:

- **Is focused** — one fix or feature per PR.
- **Explains why**, not just what, and links the issue it resolves.
- **Passes locally**: `npm test`, no new lint problems, and the build and worker typecheck above.
- **Covers behavior changes with tests**, and **updates the docs** (README, `docs/`) when user-visible behavior, configuration or the API changes.
- **Includes screenshots** (light and dark) for UI changes.
- **Contains no secrets**, private hostnames, API keys, webhook URLs or personal data — including in test fixtures and screenshots.

The CLA check must be green before review.

## Code of conduct

Be kind. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
