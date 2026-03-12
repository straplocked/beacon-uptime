# Beacon Uptime

Open-source uptime monitoring platform with public status pages, incident management, and multi-channel alerting. Built with Next.js 16, PostgreSQL + TimescaleDB, and BullMQ.

## Features

- **6 monitor types** -- HTTP, TCP, DNS, SSL, Ping, Heartbeat
- **Public status pages** -- branded, embeddable, with custom domains
- **Incident management** -- manual and auto-created incidents with timeline updates
- **Multi-channel alerts** -- Email (Brevo), Slack, Discord, Webhooks (HMAC-signed)
- **Subscriber notifications** -- visitors subscribe to status page updates via email
- **REST API** -- full v1 API with key-based auth and rate limiting
- **Plan-based billing** -- Free / Pro / Team tiers via Stripe
- **Time-series analytics** -- TimescaleDB continuous aggregates for uptime history
- **Dark mode** -- OS-preference detection, teal-cyan brand theme

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Database | PostgreSQL 16 + TimescaleDB |
| ORM | Drizzle ORM |
| Queue | BullMQ + Redis 7 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Payments | Stripe |
| Email | Brevo (Sendinblue) |
| Charts | Recharts |
| Validation | Zod 4 |

## Architecture

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
    Dashboard   Public API   Status Pages
    (internal)    (v1)        (/s/[slug])
         |          |           |
         +-----+----+-----------+
               |
          PostgreSQL + TimescaleDB
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

**Three processes run in production:**

1. **Next.js app** -- serves dashboard, API routes, and status pages
2. **Scheduler** -- polls for due monitors every 15s, enqueues check jobs, manages heartbeats, runs data retention cleanup
3. **Worker** -- processes monitor checks and sends notifications via BullMQ queues

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + Redis)

### Setup

```bash
# Clone and install
git clone <repo-url> && cd beacon-uptime
npm install

# Start database and Redis
docker compose up -d db redis

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# Run migrations and seed demo data
npm run db:migrate
npm run db:seed
```

### Run (3 terminals)

```bash
# Terminal 1 -- Next.js dev server
npm run dev

# Terminal 2 -- BullMQ worker (monitor checks + notifications)
npm run worker

# Terminal 3 -- Scheduler (job scheduling + heartbeats + cleanup)
npm run scheduler
```

Open [http://localhost:3000](http://localhost:3000). Demo login: `demo@beacon.local` / `password123`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `SESSION_SECRET` | Yes | 64-char random string for session cookies |
| `BASE_URL` | Yes | Public URL (used in emails, status page links) |
| `BREVO_API_KEY` | For email | Brevo (Sendinblue) API key |
| `FROM_EMAIL` | For email | Sender email address |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For billing | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | For billing | Stripe price ID for Pro plan |
| `STRIPE_TEAM_PRICE_ID` | For billing | Stripe price ID for Team plan |
| `PROBE_REGION` | No | Region identifier for check results (default: `us-east`) |

## Project Structure

```
src/
  app/
    (auth)/              # Login, register pages
    (dashboard)/         # Dashboard pages (monitors, incidents, status pages, settings)
    api/
      auth/              # Login, register, me, logout
      internal/          # Dashboard API (session auth)
      v1/                # Public API (API key auth)
      public/            # Unauthenticated endpoints (subscribe, confirm, status)
      webhooks/          # Stripe webhook
    s/[slug]/            # Public status pages
  components/
    ui/                  # shadcn/ui primitives
    dashboard/           # Dashboard shell, forms
    monitors/            # Response chart, check history, actions
    status-page/         # Component row, uptime bar, incident card
  lib/
    auth/                # Session + API key auth, password hashing
    db/                  # Drizzle schema, migrations, connection
    monitoring/
      checks/            # HTTP, TCP, DNS, SSL, Ping check implementations
      evaluator.ts       # Status transitions, auto-incidents, notification dispatch
    notifications/       # Email, Slack, Discord, Webhook, Subscriber email
    queue/               # BullMQ queue definitions
    stripe/              # Stripe client
    plans.ts             # Plan limits and feature gates
    rate-limit.ts        # Redis sliding-window rate limiter
  worker/
    index.ts             # BullMQ workers (monitor checks + notifications)
    scheduler.ts         # Scheduling loop, heartbeat monitoring, data retention
scripts/
  migrate.ts             # DB migrations + TimescaleDB setup
  seed.ts                # Demo data seeding
public/
  widget.js              # Embeddable status page widget
```

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | Accounts with email/password auth, plan tier, Stripe IDs, API key |
| `sessions` | Cookie-based sessions (30-day expiry) |
| `monitors` | Monitor definitions (type, target, interval, thresholds) |
| `check_results` | TimescaleDB hypertable -- time-series check data |
| `status_pages` | Public status page configuration (branding, slug, custom domain) |
| `status_page_monitors` | Join table linking monitors to status pages with display options |
| `incidents` | Incident records with status and impact level |
| `incident_updates` | Timeline entries for each incident |
| `notification_channels` | User notification configs (email, Slack, Discord, webhook) |
| `subscribers` | Email subscribers to status page updates |

### Continuous Aggregates (TimescaleDB)

- `hourly_uptime` -- per-hour uptime stats per monitor
- `daily_uptime` -- per-day uptime stats per monitor

### Data Retention

| Plan | Raw Checks | Aggregates |
|------|-----------|------------|
| Free | 7 days | 1 year |
| Pro | 30 days | 1 year |
| Team | 90 days | 1 year |

## Monitor Types

| Type | Target Format | What It Checks |
|------|--------------|----------------|
| HTTP | `https://example.com/health` | Status code, response time, TLS expiry |
| TCP | `host:port` | TCP connection success |
| DNS | `example.com` | DNS resolution |
| SSL | `example.com` | Certificate validity and expiry (degraded at 7-14 days) |
| Ping | `1.2.3.4` | ICMP ping response time |
| Heartbeat | (token-based) | External service POSTs to `/api/v1/heartbeat/[token]` |

### Status Evaluation

- **Up** -- check passed
- **Degraded** -- HTTP response time > 80% of timeout, or SSL expiry 7-14 days
- **Down** -- check failed, timeout, or SSL expired

## Monitor Lifecycle

```
Create monitor (pending)
    |
    +---> Immediate check enqueued (BullMQ)
    |         |
    |     Worker performs check
    |         |
    |     Evaluator updates status
    |         |
    |     If status changed:
    |       - Auto-create/resolve incidents
    |       - Enqueue notifications
    |
    +---> Scheduler re-enqueues every intervalSeconds
```

## Plans

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Monitors | 3 | 25 | 100 |
| Min check interval | 5 min | 1 min | 30 sec |
| Status pages | 1 | 3 | 10 |
| Notification channels | 1 | Unlimited | Unlimited |
| Data retention | 7 days | 30 days | 90 days |
| API access | -- | Yes | Yes |
| Custom domains | -- | Yes | Yes |
| Custom CSS | -- | Yes | Yes |
| Subscriber notifications | -- | Yes | Yes |
| Embeddable widget | -- | Yes | Yes |
| Team members | -- | -- | 5 |

## API Reference

All v1 endpoints require a Bearer token (`Authorization: Bearer bk_...`). Generate an API key from Dashboard > Settings.

### Monitors

```
GET    /api/v1/monitors              # List monitors
POST   /api/v1/monitors              # Create monitor
GET    /api/v1/monitors/:id          # Get monitor
PUT    /api/v1/monitors/:id          # Update monitor
DELETE /api/v1/monitors/:id          # Delete monitor
POST   /api/v1/monitors/:id/pause    # Pause monitor
POST   /api/v1/monitors/:id/resume   # Resume monitor
```

### Incidents

```
GET    /api/v1/incidents             # List incidents
POST   /api/v1/incidents             # Create incident
GET    /api/v1/incidents/:id         # Get incident
PUT    /api/v1/incidents/:id         # Update incident
DELETE /api/v1/incidents/:id         # Delete incident
POST   /api/v1/incidents/:id/updates # Add incident update
```

### Status Pages

```
GET    /api/v1/status-pages          # List status pages
POST   /api/v1/status-pages          # Create status page
```

### Heartbeat

```
GET/POST  /api/v1/heartbeat/:token   # Send heartbeat ping
```

### Badge

```
GET    /api/v1/badge/:monitorId      # SVG uptime badge (public, no auth)
```

### Rate Limits

60 requests per 60 seconds per API key. Rate limit headers included in responses.

## Notification Channels

| Channel | Config Fields | Notes |
|---------|--------------|-------|
| Email | `email` | Sent via Brevo with HTML template |
| Slack | `webhookUrl` | Block Kit formatted messages |
| Discord | `webhookUrl` | Embed formatted messages |
| Webhook | `url`, `secret` (optional) | JSON POST with `X-Beacon-Signature` HMAC-SHA256 header |

## Docker Deployment

```bash
# Build and run all services
docker compose up -d

# Or build just the app image
docker build -t beacon-uptime .
```

The `docker-compose.yml` includes all five services:

| Service | Port | Description |
|---------|------|-------------|
| `beacon-app` | 3100 | Next.js application |
| `beacon-worker` | -- | BullMQ worker process |
| `beacon-scheduler` | -- | Scheduling + heartbeat + cleanup |
| `beacon-db` | 5433 | PostgreSQL 16 + TimescaleDB |
| `beacon-redis` | 6380 | Redis 7 |

## NPM Scripts

```bash
npm run dev           # Start Next.js dev server
npm run build         # Build app + worker for production
npm run start         # Start production server
npm run worker        # Start BullMQ worker
npm run scheduler     # Start scheduler
npm run db:generate   # Generate Drizzle migrations
npm run db:migrate    # Run migrations + TimescaleDB setup
npm run db:push       # Push schema directly (no migration files)
npm run db:studio     # Open Drizzle Studio
npm run db:seed       # Seed demo data
```

## License

Private
