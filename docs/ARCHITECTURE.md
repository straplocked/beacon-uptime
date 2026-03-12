# Architecture

## System Overview

Beacon Uptime runs as three cooperating processes backed by PostgreSQL (with TimescaleDB) and Redis.

```
                    Internet
                       |
              +--------+--------+
              |   Next.js App   |
              |   (App Router)  |
              +--------+--------+
              |        |        |
         Dashboard  Public   REST API
         (session)  Pages    (API key)
              |        |        |
              +--------+--------+
                       |
              +--------+--------+
              |   PostgreSQL    |
              |  + TimescaleDB  |
              +--------+--------+
                       |
         +-------------+-------------+
         |                           |
  +------+------+           +--------+-------+
  |  Scheduler  |  enqueue  |    Worker      |
  |  (15s loop) +---------->|  (BullMQ)      |
  +------+------+           +--------+-------+
         |                           |
         +-------------+-------------+
                       |
              +--------+--------+
              |     Redis       |
              +-----------------+
```

## Process Responsibilities

### Next.js App

Serves three distinct interfaces:

1. **Dashboard** (`/api/internal/*`, `/(dashboard)/*`) -- session-authenticated UI for managing monitors, incidents, status pages, notifications, and billing. Uses `getCurrentUser()` from cookie-based sessions.

2. **Public Status Pages** (`/s/[slug]/*`) -- server-rendered pages showing monitor status, uptime history, and incidents. Supports custom domains, branding, and subscriber notifications.

3. **REST API** (`/api/v1/*`) -- API-key-authenticated endpoints for programmatic access. Rate-limited via Redis sliding window.

### Scheduler (`src/worker/scheduler.ts`)

Single-threaded loop running every 15 seconds:

1. **Schedule checks** -- queries monitors where `lastCheckedAt + intervalSeconds <= now`, enqueues BullMQ jobs with deduplication to prevent concurrent duplicate checks
2. **Check heartbeats** -- finds heartbeat monitors where `lastHeartbeatAt + interval` has passed and marks them as down via the evaluator
3. **Data retention** -- runs every ~1 hour, deletes check results older than the user's plan allows

### Worker (`src/worker/index.ts`)

BullMQ worker processing two queues:

1. **`monitor-checks`** (concurrency: 10, rate: 50/sec) -- performs the actual HTTP/TCP/DNS/SSL/Ping check, then calls `processCheckResult()` to update status and trigger notifications
2. **`notifications`** (concurrency: 5) -- sends alerts via Email, Slack, Discord, or Webhook

## Monitor Lifecycle

```
1. Monitor created (status: "pending")
   |
2. Immediate check enqueued to BullMQ
   |
3. Worker picks up job, performs check
   |
4. Evaluator (processCheckResult):
   a. Writes check result to check_results table
   b. Updates monitor status + lastCheckedAt
   c. If status changed (and not from pending/paused):
      - Down/degraded: creates auto-incident on linked status pages
      - Up (from down/degraded): resolves open auto-incidents
      - Enqueues notifications to all user's channels
   |
5. Scheduler re-enqueues when interval elapses
```

## Data Flow: Check Result Processing

```
Worker
  |
  v
processCheckResult(monitor, result)
  |
  +---> INSERT check_results (time-series data)
  |
  +---> UPDATE monitors SET status, lastCheckedAt
  |
  +---> Status changed?
        |
        Yes ---> createAutoIncident() or resolveAutoIncidents()
        |          |
        |          +---> INSERT incidents + incident_updates
        |          +---> enqueueSubscriberNotifications()
        |
        +------> enqueueNotifications()
                   |
                   +---> Queue jobs to "notifications" queue
                          |
                          v
                   Notification Worker sends Email/Slack/Discord/Webhook
```

## Database Design

### Time-Series Strategy

The `check_results` table is a TimescaleDB hypertable partitioned by `time`. This enables:

- Efficient time-range queries for uptime calculation
- `time_bucket()` aggregation for charts and statistics
- Automatic chunk management and compression
- Retention policies that drop old chunks without expensive DELETE operations

### Continuous Aggregates

Two materialized views pre-compute uptime statistics:

- **`hourly_uptime`** -- per-monitor, per-hour: total checks, up count, avg response time
- **`daily_uptime`** -- per-monitor, per-day: same metrics

These make status page rendering fast even with millions of check results.

### Key Relationships

```
users
 ├── monitors (1:N)
 │    ├── check_results (1:N, hypertable)
 │    └── status_page_monitors (N:M join)
 ├── status_pages (1:N)
 │    ├── status_page_monitors (1:N)
 │    ├── incidents (1:N)
 │    │    └── incident_updates (1:N)
 │    └── subscribers (1:N)
 ├── notification_channels (1:N)
 └── sessions (1:N)
```

## Authentication

### Session Auth (Dashboard)

- PBKDF2 SHA-256 (100k iterations, 16-byte salt) for password hashing
- 64-character hex session IDs stored in `sessions` table
- HttpOnly, Secure, SameSite=lax cookies with 30-day expiry
- Middleware redirects unauthenticated users to login

### API Key Auth (v1 API)

- Format: `bk_` + 64-character hex
- Stored in `users.apiKey` (unique index)
- Passed as Bearer token
- Only available on Pro and Team plans

## Queue Architecture

BullMQ with Redis provides reliable job processing:

```
monitor-checks queue:
  - Deduplication: { id: "check-{monitorId}" }
    Prevents concurrent checks for the same monitor.
    Key auto-clears on job completion.
  - Retry: 2 attempts, exponential backoff (5s base)
  - Cleanup: keep 1000 completed, 5000 failed

notifications queue:
  - Priority: 1 (down), 2 (subscriber), 3 (other)
  - Retry: 3 attempts, exponential backoff (10s base)
  - Cleanup: keep 1000 completed, 5000 failed
```

## Rate Limiting

Redis sorted-set sliding window:

- **v1 API**: 60 requests / 60 seconds per API key
- **Public status**: 30 requests / 60 seconds per IP
- **Subscribe**: 5 requests / 60 seconds per IP
- Returns `429` with `Retry-After` header when exceeded

## Notification Pipeline

When a monitor's status changes, notifications are dispatched to all of the user's configured channels:

| Channel | Transport | Format |
|---------|----------|--------|
| Email | Brevo (Sendinblue) API | HTML with status indicators |
| Slack | Incoming Webhook | Block Kit with color-coded attachments |
| Discord | Webhook | Embed with fields |
| Webhook | HTTP POST | JSON payload with HMAC-SHA256 signature |

Subscriber notifications (incident emails to status page subscribers) are a separate path, triggered only on auto-incident creation and gated by plan.

## Plan Enforcement

Plan limits are checked at multiple layers:

- **API routes**: `canAddMonitor()`, `canUseApi()`, `getMinCheckInterval()`
- **Evaluator**: `subscriberNotifications` flag gates subscriber emails
- **Public endpoints**: `floatingWidget` flag gates widget data
- **Scheduler**: retention days per plan for cleanup

## Deployment

### Docker Compose (Production)

Five services with health checks and restart policies:

1. `beacon-db` -- TimescaleDB (PostgreSQL 16)
2. `beacon-redis` -- Redis 7
3. `beacon-app` -- Next.js standalone build
4. `beacon-worker` -- BullMQ workers
5. `beacon-scheduler` -- Scheduling loop

### Build Pipeline

```bash
npm run build
# 1. next build (standalone output)
# 2. tsx --tsconfig tsconfig.worker.json src/worker/index.ts
```

Worker uses a separate `tsconfig.worker.json` (ES2022 target) because it imports from `src/lib/` but is excluded from the Next.js build.
