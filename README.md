# Beacon Uptime

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)
[![CLA required](https://img.shields.io/badge/contributions-CLA%20required-informational.svg)](CLA.md)

A self-hostable uptime monitor and status page tool with a real incident
response loop, not just a green/red dashboard: acknowledge an incident,
work it with your team in internal-only comments, and only publish the
updates you choose to your public status page and subscribers.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/dark/dashboard.png">
    <img src="docs/assets/screenshots/light/dashboard.png" alt="Beacon Uptime dashboard, showing monitors, an active incident banner, and uptime stats" width="880">
  </picture>
</p>

## Why Beacon

- **A real incident response loop, not just alerting.** Acknowledge an
  incident so your team knows someone's on it. Work the problem in
  timeline comments that are explicitly marked internal-only — they never
  reach your public status page or subscribers — and post a separate
  public update only when you're ready to. See it in the screenshots
  below.
- **Multi-tenant from the start**, not bolted on later: organizations,
  roles (owner/admin/member/viewer), and an org switcher are core to every
  install, not a paid tier.
- **One edition, self-hosted, AGPL-3.0-only.** Everything in this repo —
  unlimited monitors, status pages, the API, custom domains, subscriber
  notifications — is available to every install. No license key, no
  usage-gated feature flags.
- **A REST API and an MCP server**, so you can script it or point an
  MCP-aware agent (Claude Desktop, Claude Code, Cursor, etc.) at it to
  query uptime, create monitors, or acknowledge incidents from chat. MCP
  support is a convenience, not something unique to Beacon — several other
  uptime tools ship one too.

What Beacon **doesn't** do yet: on-call schedules or escalation policies.
That's on the [roadmap](docs/ROADMAP.md), not built. If you need paging
today, keep using a dedicated on-call tool alongside Beacon's alerting.

## Screenshots

<table>
<tr>
<td width="50%">

**Monitor detail** — response time chart with an incident-window overlay, percentiles, related incidents
<img src="docs/assets/screenshots/dark/monitor-detail.png" alt="Monitor detail page with response time chart">
</td>
<td width="50%">

**Incident collaboration** — acknowledge state, a threaded timeline, and an internal-only comment that won't publish
<img src="docs/assets/screenshots/dark/incident-detail.png" alt="Incident detail page showing the acknowledge state and an internal comment">
</td>
</tr>
<tr>
<td width="50%">

**Public status page** — auto-branded, grouped components, uptime history
<img src="docs/assets/screenshots/dark/status-page.png" alt="Public status page with grouped components and uptime bars">
</td>
<td width="50%">

**Settings** — API keys, MCP connection string, notification channels
<img src="docs/assets/screenshots/dark/settings.png" alt="Settings page showing API keys and MCP setup">
</td>
</tr>
</table>

Light mode is a first-class target too (see the hero image above) — full
set for both themes lives in [docs/assets/screenshots/](docs/assets/screenshots/).
All screenshots use fake `example.com`-style data; see
[scripts/screenshots/](scripts/screenshots/) to re-shoot your own.

## Features

- **6 monitor types** — HTTP, TCP, DNS, SSL, Ping, Heartbeat
- **Public status pages** — branded, embeddable, with custom domains
- **Incident management** — manual + auto-created incidents with timeline
  updates, **acknowledge state**, and **internal-only comments** that never
  publish to subscribers
- **Multi-channel alerts** — Email (Brevo), Slack, Discord, Webhooks
  (HMAC-signed)
- **Subscriber notifications** — visitors subscribe to status page updates
  via email
- **REST API** — full v1 API with key-based auth and rate limiting ([docs/API.md](docs/API.md))
- **MCP server** — `POST /api/mcp`, 16 tools (list / create / update /
  pause / acknowledge / brand-extract / etc.) for MCP clients like Claude
  Desktop, Claude Code, and Cursor ([docs/MCP.md](docs/MCP.md))
- **Multi-tenant by default** — organizations, roles, and an org switcher
  are core, not a paid tier
- **Time-series analytics** — TimescaleDB continuous aggregates for uptime
  history, p50/p95/p99 percentile stats per monitor (falls back to plain
  PostgreSQL if TimescaleDB isn't available — see [Architecture](#architecture))
- **Light + dark mode** — both first-class; semantic status/severity/incident
  color tokens

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Database | PostgreSQL 16, TimescaleDB extension optional |
| ORM | Drizzle ORM |
| Queue | BullMQ + Redis 7 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Email | Brevo (Sendinblue) |
| Charts | Recharts |
| Validation | Zod 4 |

## Architecture

Three processes share one codebase and one database:

```
                 Browser
                    |
              +-----+------+
              |  Next.js    |
              |  App Router |
              +-----+------+
                    |
         +----------+-----------+
         |          |           |
    Dashboard   REST API    Status Pages
    (session)   (API key)    (/s/[slug])
         |          |           |
         +-----+----+-----------+
               |
          PostgreSQL
      (TimescaleDB extension
       optional, see below)
               |
          +----+----+
          |         |
      Scheduler   Worker
      (15s loop)  (BullMQ)
          |         |
          +----+----+
               |
             Redis
```

1. **Next.js app** — serves the dashboard, all API routes (`/api/internal`,
   `/api/v1`, `/api/public`, `/api/mcp`), and public status pages.
2. **Scheduler** (`src/worker/scheduler.ts`) — polls for due monitors every
   15s, enqueues check jobs, flags overdue heartbeat monitors, and runs
   data-retention cleanup roughly hourly.
3. **Worker** (`src/worker/index.ts`) — a BullMQ worker that performs the
   actual HTTP/TCP/DNS/SSL/Ping checks and delivers notifications.

**PostgreSQL is required; the TimescaleDB extension is optional.**
`scripts/migrate.ts` tries to enable TimescaleDB and, if it's available,
converts `check_results` into a hypertable with `hourly_uptime` /
`daily_uptime` continuous aggregates for fast percentile queries. If the
extension isn't installed (a stock `postgres:17` container, most managed
Postgres offerings, etc.), migrations detect that and fall back to plain
tables automatically — Beacon still works, retention is handled by the
scheduler's `DATA_RETENTION_DAYS` cleanup instead of a TimescaleDB
retention policy, and percentile queries just run a bit slower at scale.

**Redis** backs the BullMQ queues (`monitor-checks`, `notifications`) and
the API rate limiter.

Full detail, including the check pipeline, auth model, and queue config:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick Start (local development)

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + Redis)

### Setup

```bash
git clone https://github.com/straplocked/beacon-uptime.git && cd beacon-uptime
npm install

# Start database and Redis (host ports 5433 / 6380)
docker compose up -d db redis

cp .env.example .env.local
# edit .env.local — see Environment Variables below

# DATABASE_URL isn't read from .env.local by the db:* scripts; export it
export DATABASE_URL=postgresql://beacon:beacon@localhost:5433/beacon
npm run db:migrate
npm run db:seed
```

### Run (3 terminals — all three are needed for monitoring to actually run)

```bash
npm run dev         # dashboard + API on http://localhost:3100
npm run worker       # BullMQ worker — monitor checks + notification delivery
npm run scheduler    # scheduling loop + heartbeat watchdog + retention cleanup
```

Open [http://localhost:3100](http://localhost:3100). Demo login (from
`npm run db:seed`): `demo@beacon.local` / `password123`.

## Self-Hosting

Two supported paths — pick one:

### Docker Compose (VM / NAS / general Docker host)

Multi-container: app, worker, scheduler, Postgres+TimescaleDB, Redis.

```bash
git clone https://github.com/straplocked/beacon-uptime.git && cd beacon-uptime
cp .env.example .env      # fill in DATABASE_URL/REDIS_URL secrets, BASE_URL, etc.
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` pulls the prebuilt `ghcr.io/straplocked/beacon-uptime:latest`
image (built on every push to `main` — see `.github/workflows/docker-publish.yml`)
rather than building locally, adds a password-protected Redis and a daily
`pg_dump` backup sidecar, and expects `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`BASE_URL`, `SESSION_SECRET`, `BREVO_API_KEY`, and `FROM_EMAIL` in the
environment (`.env.example` covers the app-level ones; set the Postgres/Redis
passwords yourself). The app container runs migrations automatically on
startup. Put a reverse proxy (nginx, Nginx Proxy Manager, Caddy, Traefik...)
in front for TLS. Full walkthrough, including an Nginx Proxy Manager
example: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### All-in-one image (single container — Unraid or plain `docker run`)

`ghcr.io/straplocked/beacon-uptime:aio` bundles the app, worker, scheduler,
an embedded PostgreSQL+TimescaleDB, and a loopback-only Redis under
`supervisord` in one container — no separate database or cache container to
run. `DATABASE_URL`/`REDIS_URL` are optional overrides if you'd rather point
it at something external.

```bash
docker run -d --name beacon-uptime \
  -p 3410:3000 \
  -v /path/to/appdata:/data \
  -e BASE_URL=https://beacon.example.com \
  ghcr.io/straplocked/beacon-uptime:aio
```

For Unraid Community Applications, the repo ships a ready-made template at
[`unraid/beacon-uptime.xml`](unraid/beacon-uptime.xml) (copy it to
`/boot/config/plugins/dockerMan/templates-user/` or wait for it to appear
in Community Applications). Default WebUI port is `3410`. No secret to type
in to get started — the container generates its own session secret and
database password into `/data` on first boot. Full runbook, including
backups, updates, and the reverse-proxy `Secure`-cookie gotcha:
[docs/UNRAID.md](docs/UNRAID.md).

Either path: **the first account to register owns the install** — see
`ALLOW_REGISTRATION` below.

## Environment Variables

Derived from [`.env.example`](.env.example) and what the code actually
reads (`process.env.*` across `src/` and `scripts/`).

| Variable | Required | Description |
|----------|----------|--------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. TimescaleDB extension optional — see [Architecture](#architecture). |
| `REDIS_URL` | Yes | Redis connection string (BullMQ queues + rate limiter). |
| `BASE_URL` | Yes | Public URL. Every absolute link Beacon generates — status page URLs, email links, incident links — is built from this, not from request headers, so it must be correct before you invite anyone. |
| `SESSION_SECRET` | Yes (per `.env.example`) | A 64-char random string. Currently unused by the app — session tokens are opaque, cryptographically random IDs looked up server-side in the `sessions` table, not signed against a secret. Still recommended to set to a strong random value in case that changes; harmless either way. |
| `BREVO_API_KEY` | For email | Brevo (Sendinblue) API key, used for alert emails and subscriber notifications. |
| `FROM_EMAIL` | For email | Sender address for outgoing email. |
| `ALLOW_REGISTRATION` | No (default `false`) | Registration is open only until the first account exists — that account owns the install, with no seeded admin and no separate signup gate. Once an account exists, `/api/auth/register` returns `403` unless this is `true`. Set it to `true` to let anyone who can reach the URL sign up and create their own organization. |
| `DATA_RETENTION_DAYS` | No (default `365`) | Days of raw `check_results` kept before cleanup. One retention window for the whole install; continuous aggregates aren't pruned by it. |
| `PROBE_REGION` | No (default `us-east`) | Region identifier tagged onto check results. |

### Advanced: worker tuning

Not in `.env.example` (sane defaults baked in), but read directly by
`src/worker/index.ts` if you need to tune throughput:

| Variable | Default | Description |
|----------|---------|--------------|
| `WORKER_CONCURRENCY` | `10` | Concurrent `monitor-checks` jobs processed by the worker. |
| `WORKER_RATE_LIMIT` | `50` | Max `monitor-checks` jobs per second. |
| `NOTIFICATION_CONCURRENCY` | `5` | Concurrent `notifications` queue jobs. |

## API & MCP

- **REST API** (`/api/v1/*`) — Bearer API-key auth (`bk_...`, generate one
  from Dashboard → Settings), 60 requests/60s per key. Monitors, incidents,
  status pages, heartbeat pings, and a public SVG uptime badge. Full
  reference: [docs/API.md](docs/API.md).
- **MCP server** (`POST /api/mcp`) — the same API-key auth, exposed as a
  stateless [Model Context Protocol](https://modelcontextprotocol.io)
  endpoint for MCP-aware clients (Claude Desktop, Claude Code, Cursor, or
  your own SDK client). 16 tools covering monitors, checks/analytics,
  incidents (including `acknowledge_incident` and internal-only comment
  updates), and status pages. Cross-org access is structurally impossible —
  the org is bound to the server instance from the API key, never from a
  tool argument. Client config examples and a `curl` walkthrough:
  [docs/MCP.md](docs/MCP.md).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture: processes, queues, schema |
| [docs/API.md](docs/API.md) | REST API reference (`/api/v1/*`) |
| [docs/MCP.md](docs/MCP.md) | MCP server: tools, auth, client configuration |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker Compose production deployment |
| [docs/UNRAID.md](docs/UNRAID.md) | All-in-one image for Unraid Community Applications |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Sprint-by-sprint roadmap |
| [scripts/screenshots/](scripts/screenshots/) | How the screenshots in this README were captured, and how to re-shoot them |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, tests, lint, PR process |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability |

## Contributing

Beacon Uptime is open source under the [AGPL-3.0-only](LICENSE) license.
Contributions require signing the [Contributor License Agreement](CLA.md) —
a one-time click via the CLA bot on your first pull request — which grants
the maintainer the right to distribute your contribution under other
licenses too (what would let the same code ship in a possible future
hosted edition, alongside the AGPL codebase). You keep the copyright to
your own contribution either way. If that arrangement isn't for you, the
AGPL still gives you every right to fork and build on the project
independently.

Dev setup, running tests, lint rules, and the PR checklist:
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

Beacon Uptime is licensed under the [GNU Affero General Public License
v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version of Beacon
over a network for others to use, the AGPL (section 13) requires you to
make that version's source available to those users — for example, a link
in your dashboard or status page footer.
