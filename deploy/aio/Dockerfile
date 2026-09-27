# All-in-one image for Unraid Community Applications: embedded PostgreSQL 16
# + the TimescaleDB extension, Redis bound to loopback, the Next.js app, the
# worker and the scheduler — one container, supervised by supervisord.
#
# Build from the repo root:
#   docker build -f deploy/aio/Dockerfile -t beacon-uptime:aio .
#
# All state (Postgres data dir + generated secrets) lives under the /data
# volume. DATABASE_URL and/or REDIS_URL, if provided, skip the matching
# embedded service.

# ---- deps ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build (Next.js + worker/scheduler) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runner

# PostgreSQL 16 (Debian bookworm ships 15, so add the PGDG repo) plus the
# TimescaleDB extension for it, Redis, and supervisord. Beacon's own
# migrations (scripts/migrate.ts) create the timescaledb extension, convert
# check_results to a hypertable, and set up continuous aggregates — the
# embedded database must have the extension installed or db:migrate fails.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release wget \
    && install -d /usr/share/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/pgdg-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
      | gpg --dearmor -o /usr/share/keyrings/timescaledb-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/timescaledb-archive-keyring.gpg] https://packagecloud.io/timescale/timescaledb/debian/ $(lsb_release -cs) main" \
      > /etc/apt/sources.list.d/timescaledb.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      postgresql-16 postgresql-client-16 timescaledb-2-postgresql-16 \
      redis-server supervisor openssl iputils-ping \
    && apt-get purge -y gnupg lsb-release \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    # postgresql-common auto-creates a default cluster on package install;
    # we run our own postgres directly against $PGDATA, so drop it.
    && rm -rf /var/lib/postgresql/16/main /etc/postgresql

ENV PG_BIN=/usr/lib/postgresql/16/bin
ENV PATH="${PG_BIN}:${PATH}"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Next.js standalone server + worker/scheduler bundles (same layout as the
# root Dockerfile), plus migrations for db:migrate.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

COPY deploy/aio/supervisord.conf /etc/supervisor/conf.d/beacon-apps.conf
COPY deploy/aio/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /data /run/postgresql /var/log/supervisor \
    && chown -R postgres:postgres /run/postgresql

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PGDATA=/data/pgdata \
    POSTGRES_USER=beacon \
    POSTGRES_DB=beacon \
    BASE_URL=http://localhost:3410 \
    FROM_EMAIL=noreply@beacon.local \
    PROBE_REGION=us-east \
    DATA_RETENTION_DAYS=365

EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
