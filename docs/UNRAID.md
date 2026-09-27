# Beacon Uptime on Unraid — the all-in-one image

This is the runbook for the single-container image built from
`deploy/aio/Dockerfile` and published as `ghcr.io/straplocked/beacon-uptime:aio`.
It bundles everything Beacon needs — an embedded PostgreSQL 16 + TimescaleDB
database, a loopback-only Redis, the dashboard/API, the BullMQ worker and the
scheduler — under supervisord, so the Unraid install is one container and one
appdata folder. There is no separate database or cache container to manage.

For the general (non-Unraid) Docker Compose deployment, see
[DEPLOYMENT.md](DEPLOYMENT.md). This document covers only the Unraid
Community Applications path.

## Architecture

```
                 ┌───────────────────────────────────────────┐
                 │  container  (ghcr.io/.../beacon-uptime:aio)│
  browser ──────▶│  supervisord                                │
                 │   ├─ app        (Next.js dashboard + API)   │
                 │   ├─ worker     (BullMQ: monitor checks)    │
                 │   ├─ scheduler  (enqueues due checks / 15s) │
                 │   ├─ postgres   (embedded, TimescaleDB)      │──▶ /data/pgdata
                 │   └─ redis      (embedded, loopback only)    │──▶ /data/redis
                 └───────────────────────────────────────────┘
                        one host port  ──▶  container :3000
```

`DATABASE_URL` and `REDIS_URL` are both optional overrides: leave them blank
to use the embedded services (the default and the recommended setup for a
single Unraid box), or point either at something external to skip that piece
entirely. An external database **must** have the TimescaleDB extension
available — Beacon's own migrations create the extension, a hypertable and
two continuous aggregates, and fail fast if the extension isn't there.

## Install via the template

1. **Docker tab → Add Container → Template: beacon-uptime** (Community
   Applications, once listed, or import `unraid/beacon-uptime.xml` onto the
   flash the way hellgrid's runbook does it — copy it to
   `/boot/config/plugins/dockerMan/templates-user/`).
2. Check the port mapping (default `3410 → 3000`) doesn't collide with
   anything else on the box, and the appdata path (default
   `/mnt/user/appdata/beacon-uptime → /data`).
3. If you're putting a reverse proxy in front (recommended for anything
   beyond your own LAN), set **Base URL** to that proxy's public https
   address, e.g. `https://beacon.example.com`. Beacon builds every absolute
   link — status page URLs, alert-email links, incident links — from this
   value, not from request headers, so it has to be right before you invite
   anyone.
4. Everything else is optional. **Apply.**

You do not need to type any secret to get a working install — the container
generates its own session secret and embedded-database password into
`/data` on first boot and reuses them on every later boot.

First boot takes under a minute: initialize the embedded database, run
migrations, start everything. Watch it in the Docker tab's Logs until you
see `Ready in`. Then open the WebUI and register the first account — there
is no seeded admin user and no separate signup gate; whoever registers first
just has their own organization, like every account after them.

## Reverse proxy notes

If you front this with Nginx Proxy Manager or SWAG (the same reverse-proxy
shape as any other single-container appliance on this LAN):

| Field | Value |
|---|---|
| Forward Hostname / IP | this Unraid box's IP |
| Forward Port | the host port from step 2 (default 3410) |
| Websockets Support | off (Beacon doesn't use any) |
| Block Common Exploits | on |
| SSL → Force SSL | on |

⚠ **The session cookie is always marked `Secure`** in this image — Beacon
ties that to `NODE_ENV=production`, which this image always sets, rather than
to an environment toggle. That's the correct, more secure setting once a
proxy terminates TLS in front of it (a `Secure` cookie set over an https
connection to the proxy works fine even though the proxy's own hop to the
container is plain http). But it also means **logging in only works through
an https:// URL**: hitting the container directly over `http://<LAN-ip>:3410`
will accept the password and then silently fail to keep you signed in,
because the browser won't send a `Secure` cookie back over a plain-http
connection. Always reach the install through the Base URL's https hostname
once a proxy is in front of it.

Beacon also doesn't force any http→https redirect or read the `Host` header
to build links, so there's no redirect-loop hazard from the proxy hop itself
— every absolute link comes from the Base URL setting, not the request.

## Where data lives

Everything is under the one Data path (`/mnt/user/appdata/beacon-uptime` by
default):

- `pgdata/` — the embedded PostgreSQL data directory (all monitors, status
  pages, incidents, organizations, accounts).
- `redis/` — the embedded Redis's append-only file (queued/in-flight jobs;
  losing it just means in-flight checks are re-enqueued, not real data loss).
- `secrets.env` — generated on first boot: the session-signing secret and
  the embedded database's password. Mode `600`, root-owned.

## Backups

Stop the container, then copy the whole appdata folder:

```sh
docker stop beacon-uptime
cp -a /mnt/user/appdata/beacon-uptime /mnt/user/backups/beacon-uptime-$(date +%F)
docker start beacon-uptime
```

Restoring is the reverse: stop the container, replace the appdata folder
with a backed-up copy, start it. Because `secrets.env` travels with the rest
of `/data`, a restored copy keeps working with the same sessions and the
same database password — nothing needs to be regenerated or re-typed.

## Updates

CI publishes `ghcr.io/straplocked/beacon-uptime:aio` and
`:aio-sha-<shortsha>` on every push to `main`, without provenance
attestations — that's deliberate, so Unraid's own digest comparison keeps
working. To update:

1. **Docker tab → beacon-uptime → Check for Updates.**
2. If one is available, **Apply** (or **Force Update**). Unraid re-pulls
   `:aio` and recreates the container; `/data` is untouched.
3. Migrations run on every boot, so an upgrade that changes the schema
   applies itself automatically. Watch the Logs after an update the same way
   as a first boot.

## Rollback

Edit the container, change **Repository** from
`ghcr.io/straplocked/beacon-uptime:aio` to a previous
`ghcr.io/straplocked/beacon-uptime:aio-sha-<shortsha>` tag (from the
[package page](https://github.com/straplocked/beacon-uptime/pkgs/container/beacon-uptime)
or the repo's commit history), **Apply**. ⚠ Migrations that already ran are
not un-run by an older image — a rollback across a schema-changing migration
needs a database restore from backup, same as any Postgres-backed app.

## What this runbook does not prove

Written and verified from the dev box: the image is built and its full
stack (embedded Postgres + TimescaleDB, embedded Redis, register-a-user,
create-a-monitor, worker-runs-a-check, restart-and-persist) is proved
locally with `docker run` before every push. No request has traversed a real
reverse proxy or a real public hostname — that first end-to-end proof, once
this is installed behind an actual proxy, is the operator's.

## First login

Open the public URL and register. The first account claims the install (it owns its organization); after that, registration is closed and `/api/auth/register` returns 403. To let more people sign up, set `ALLOW_REGISTRATION=true` in the template (anyone who can reach the URL can then register and create monitors from your server).
