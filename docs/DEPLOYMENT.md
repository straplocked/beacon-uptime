# Beacon Uptime - Production Deployment on Unraid

## Architecture

```
[Internet] → [NPM (Let's Encrypt)] → [Prod VM:3100] → [beacon-app:3000]
                                                        [beacon-worker]
                                                        [beacon-scheduler]
                                                        [beacon-db (TimescaleDB)]
                                                        [beacon-redis]
                                                        [beacon-backup]
```

All services run inside Docker Compose on a production VM. NPM routes external traffic to the VM's exposed port 3100.

## Quick Start

1. **Clone to prod VM:**
   ```bash
   git clone https://github.com/straplocked/beacon-uptime.git
   cd beacon-uptime
   ```

2. **Configure environment:**
   ```bash
   cp .env.prod.example .env
   # Edit .env with your values
   ```

3. **Start all services:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
   The app container automatically runs database migrations on startup.

4. **Seed demo data (optional):**
   ```bash
   docker exec beacon-app node dist/scripts/seed.js
   ```

## Browser Push Notifications (optional)

Beacon can push monitor up/down alerts straight to a browser that has
installed the PWA, in addition to email/Slack/Discord/webhook channels.
It's entirely optional and self-hiding: if the VAPID env vars below aren't
set, the "Browser push" toggle in Settings simply doesn't appear.

1. **Generate a VAPID key pair:**
   ```bash
   npx web-push generate-vapid-keys --json
   ```
2. **Set three env vars** (`app` *and* `worker` both need all three — the
   worker delivers the actual push, the app sends test notifications and
   serves the public key to the browser):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` — a `mailto:` address or `https://` URL you control
3. Restart the `app` and `worker` containers. Existing users opt in per
   device from Settings → Notifications → Browser push.

Dead subscriptions (uninstalled PWA, revoked permission, expired push
endpoint) are pruned automatically the next time a delivery attempt gets a
404/410 back from the push service.

## Nginx Proxy Manager Configuration

1. Open NPM dashboard (usually `http://<unraid-ip>:81`)
2. Add a new **Proxy Host**:
   - **Domain:** `status.yourdomain.com`
   - **Forward Hostname/IP:** `<prod-vm-ip>`
   - **Forward Port:** `3100`
   - **Websockets Support:** On (for future use)
3. Under **SSL** tab:
   - Request a new Let's Encrypt certificate
   - Force SSL: On
   - HTTP/2 Support: On

For wildcard/multi-tenant custom domains, add additional proxy hosts pointing to the same backend.

## CI/CD with GitHub Actions

Pushing to `main` or tagging with `v*` triggers a GitHub Actions workflow that:
1. Builds the Docker image
2. Pushes to `ghcr.io/<org>/beacon-uptime`

### Updating production:

**Manual pull:**
```bash
cd beacon-uptime
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**Auto-update with Watchtower (optional):**
Add Watchtower to your Unraid setup to auto-pull new images.

## Backups

The `backup` service runs daily pg_dumps with retention:
- 7 daily backups
- 4 weekly backups
- 6 monthly backups

Backups are stored at the path configured in `BACKUP_PATH` (default: `./backups`).

On Unraid, set `BACKUP_PATH=/mnt/user/appdata/beacon/backups` to store backups on the parity-protected array.

## Monitoring

- **Health check:** `GET /api/health` returns `{ status, db, redis }`
- Docker health checks are configured on the app container
- The scheduler logs monitor check activity to stdout

## Security: hosted / multi-tenant installs

A single-tenant, self-hosted install commonly monitors its own LAN (a
192.168.x.x router, a NAS, another container), so `ALLOW_PRIVATE_TARGETS`
defaults to `true` and monitor targets are allowed to be private addresses.

If you're operating Beacon as a hosted service where other people's monitor
targets aren't trusted, set `ALLOW_PRIVATE_TARGETS=false` on the `worker`
service's environment. Every check (http, tcp, dns, ssl, ping) then resolves
its target first and refuses to run if it resolves to a private, loopback,
link-local (cloud metadata), or otherwise reserved address — the same SSRF
guard already used for user-supplied URLs (status-page favicon extraction).
See `.env.prod.example` and `src/lib/net/target-policy.ts`.

## Resource Limits

Default memory limits per container:
- app: 512MB
- worker: 256MB
- scheduler: 128MB
- db: 1GB
- redis: 192MB (128MB max data + overhead)
- backup: 128MB

Adjust in `docker-compose.prod.yml` based on your VM's available RAM.
