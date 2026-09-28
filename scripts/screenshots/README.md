# README screenshot capture

Re-shoots the light/dark screenshots under `docs/assets/screenshots/` against
a disposable local instance — no real data, no shared ports, nothing left
running afterward.

## 1. Pick free ports

Avoid the always-on dev stack (3100 app / 5433 db / 6380 redis) and anything
else running locally:

```bash
for p in 3187 5487 6487; do   # replace with your own free ports if these are taken
  bash -c "</dev/tcp/127.0.0.1/$p" 2>/dev/null && echo "$p: in use" || echo "$p: free"
done
```

## 2. Start a throwaway Postgres + Redis

```bash
docker compose -p beacon-shots -f scripts/screenshots/docker-compose.yml up -d
```

This is a **standalone** compose file (not layered on the root
`docker-compose.yml` — see the comment at its top for why), using the ports
from step 1. Edit the file first if you picked different ports.

## 3. Migrate + seed demo data

```bash
export DATABASE_URL=postgresql://beacon:beacon@localhost:5487/beacon
npm run db:migrate
npx tsx scripts/screenshots/seed-demo.ts
```

`seed-demo.ts` refuses to run against anything that isn't an obvious
localhost database, and only ever inserts `demo@example.com` with fake
`example.com`/`example.org`/`example.net` monitor targets — never real
hostnames. It seeds one org with all 6 monitor types, ~24h of synthetic
check history, a status page, and an incident whose timeline includes an
internal-only comment (to show the internal/public split) and an
acknowledge event.

## 4. Run the app (on the host, not in Docker)

```bash
DATABASE_URL=postgresql://beacon:beacon@localhost:5487/beacon \
REDIS_URL=redis://localhost:6487 \
SESSION_SECRET=throwaway-secret-anything-works-here \
BASE_URL=http://localhost:3187 \
npx next dev --port 3187
```

Run it on the host (not the production Docker image) so `NODE_ENV` stays
`development`. The production image always sets `NODE_ENV=production`,
which marks the session cookie `Secure` and silently breaks login over
plain `http://localhost` (see `docs/UNRAID.md`).

The worker/scheduler don't need to run — screenshot data is pre-seeded, not
produced by live checks.

## 5. Capture

```bash
docker run --rm --network host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd)":/work -w /work \
  mcr.microsoft.com/playwright:v1.49.0-noble \
  bash -c "npm install playwright@1.49.0 --no-save --silent && BASE_URL=http://localhost:3187 node scripts/screenshots/capture.mjs"
```

`--network host` lets the container reach the host's `next dev` directly.
`--user "$(id -u):$(id -g)"` keeps the written PNGs owned by you, not root.
Playwright is installed fresh into the mount each run rather than added to
`package.json`, so this stays a zero-footprint dev tool.

Writes 6 PNGs × 2 themes into `docs/assets/screenshots/{light,dark}/`:
`dashboard.png`, `monitors.png`, `monitor-detail.png`,
`incident-detail.png`, `settings.png`, `status-page.png`.

Note: the public status page (`status-page.png`) uses its own per-page
theme (`src/lib/status-themes.ts`, e.g. "midnight") independent of the
dashboard's light/dark toggle, so that one shot is usually near-identical
in both folders — that's expected, not a capture bug.

## 6. Tear down

```bash
docker compose -p beacon-shots -f scripts/screenshots/docker-compose.yml down -v
# and stop the `next dev` process from step 4
```
