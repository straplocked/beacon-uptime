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

## Resource Limits

Default memory limits per container:
- app: 512MB
- worker: 256MB
- scheduler: 128MB
- db: 1GB
- redis: 192MB (128MB max data + overhead)
- backup: 128MB

Adjust in `docker-compose.prod.yml` based on your VM's available RAM.
