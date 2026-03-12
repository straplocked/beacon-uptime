# Beacon API Reference

Base URL: `https://beacon.pluginsynthesis.com/api`

## Authentication

All v1 endpoints require an API key (Pro and Team plans only). Generate one from **Dashboard > Settings**.

```
Authorization: Bearer bk_your_api_key_here
```

Rate limit: **60 requests per 60 seconds** per API key.

Rate limit headers are included in every response:
- `X-RateLimit-Remaining` -- requests left in current window
- `Retry-After` -- seconds until reset (only on 429)

---

## Monitors

### List Monitors

```
GET /api/v1/monitors
```

**Response** `200`

```json
{
  "monitors": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Production API",
      "type": "http",
      "target": "https://api.example.com/health",
      "status": "up",
      "intervalSeconds": 60,
      "timeoutMs": 10000,
      "expectedStatusCode": 200,
      "method": "GET",
      "isPaused": false,
      "lastCheckedAt": "2026-03-12T00:15:43.000Z",
      "createdAt": "2026-03-01T12:00:00.000Z"
    }
  ]
}
```

### Create Monitor

```
POST /api/v1/monitors
```

**Request Body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | -- | Monitor name (1-100 chars) |
| `type` | string | Yes | -- | `http`, `ping`, `tcp`, `dns`, `ssl`, or `heartbeat` |
| `target` | string | Yes | -- | URL, hostname, or `host:port` |
| `intervalSeconds` | number | No | 60 | Check interval (min 30, enforced to plan minimum) |
| `timeoutMs` | number | No | 10000 | Timeout in ms (1000-60000) |
| `expectedStatusCode` | number | No | 200 | Expected HTTP status code |
| `method` | string | No | `GET` | HTTP method: `GET`, `POST`, or `HEAD` |
| `headers` | object | No | null | HTTP headers as key-value pairs |
| `body` | string | No | null | HTTP request body |

```json
{
  "name": "Production API",
  "type": "http",
  "target": "https://api.example.com/health",
  "intervalSeconds": 60,
  "method": "GET",
  "expectedStatusCode": 200
}
```

**Response** `201`

```json
{
  "monitor": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Production API",
    "type": "http",
    "target": "https://api.example.com/health",
    "status": "pending",
    "intervalSeconds": 60,
    ...
  }
}
```

A check is enqueued immediately on creation (except heartbeat monitors).

### Get Monitor

```
GET /api/v1/monitors/:id
```

Returns the monitor, its 20 most recent checks, and 24-hour uptime stats.

**Response** `200`

```json
{
  "monitor": { ... },
  "recentChecks": [
    {
      "time": "2026-03-12T00:15:43.000Z",
      "status": "up",
      "responseTimeMs": 142,
      "statusCode": 200,
      "errorMessage": null,
      "region": "us-east"
    }
  ],
  "uptimeStats": {
    "total_checks": 1440,
    "up_checks": 1438,
    "avg_response_time": 156
  }
}
```

### Update Monitor

```
PATCH /api/v1/monitors/:id
```

All fields are optional. Only include fields you want to change.

```json
{
  "name": "Updated Name",
  "intervalSeconds": 30,
  "timeoutMs": 5000
}
```

**Response** `200`

```json
{
  "monitor": { ... }
}
```

### Delete Monitor

```
DELETE /api/v1/monitors/:id
```

**Response** `200`

```json
{
  "success": true
}
```

### Pause Monitor

```
POST /api/v1/monitors/:id/pause
```

Sets `isPaused: true` and `status: "paused"`. No checks will be performed.

**Response** `200`

```json
{
  "monitor": { ... }
}
```

### Resume Monitor

```
POST /api/v1/monitors/:id/resume
```

Sets `isPaused: false` and `status: "pending"`. An immediate check is enqueued.

**Response** `200`

```json
{
  "monitor": { ... }
}
```

---

## Incidents

### Create Incident

```
POST /api/v1/incidents
```

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `statusPageId` | string | Yes | UUID of the status page |
| `title` | string | Yes | Incident title (1-200 chars) |
| `status` | string | Yes | `investigating`, `identified`, `monitoring`, or `resolved` |
| `impact` | string | Yes | `none`, `minor`, `major`, or `critical` |
| `message` | string | Yes | Initial update message (1-2000 chars) |

```json
{
  "statusPageId": "b38531c0-b74c-41be-a800-cce77bcdbb47",
  "title": "API latency spike",
  "status": "investigating",
  "impact": "minor",
  "message": "We are investigating elevated response times on the API."
}
```

**Response** `201`

```json
{
  "incident": {
    "id": "...",
    "title": "API latency spike",
    "status": "investigating",
    "impact": "minor",
    "resolvedAt": null,
    ...
  },
  "update": {
    "id": "...",
    "status": "investigating",
    "message": "We are investigating elevated response times on the API.",
    ...
  }
}
```

### Update Incident

```
PATCH /api/v1/incidents/:id
```

```json
{
  "status": "resolved",
  "impact": "minor"
}
```

`resolvedAt` is automatically set when status changes to `resolved`, and cleared when changing away from `resolved`.

**Response** `200`

```json
{
  "incident": { ... }
}
```

### Add Incident Update

```
POST /api/v1/incidents/:id/updates
```

```json
{
  "status": "monitoring",
  "message": "A fix has been deployed. We are monitoring the situation."
}
```

Also updates the parent incident's status and `resolvedAt` accordingly.

**Response** `201`

```json
{
  "update": {
    "id": "...",
    "incidentId": "...",
    "status": "monitoring",
    "message": "A fix has been deployed. We are monitoring the situation.",
    "createdAt": "2026-03-12T01:30:00.000Z"
  }
}
```

### Delete Incident

```
DELETE /api/v1/incidents/:id
```

**Response** `200`

```json
{
  "success": true
}
```

---

## Status Pages

### List Status Pages

```
GET /api/v1/status-pages
```

**Response** `200`

```json
{
  "statusPages": [
    {
      "id": "b38531c0-b74c-41be-a800-cce77bcdbb47",
      "name": "Beacon Status",
      "slug": "beacon",
      "isPublic": true,
      "brandColor": "#14b8a6",
      ...
    }
  ]
}
```

---

## Heartbeat

Heartbeat monitors work in reverse -- your service pings Beacon at a regular interval. If Beacon doesn't receive a ping within the expected window, the monitor is marked as down.

### Send Heartbeat

```
GET /api/v1/heartbeat/:token
POST /api/v1/heartbeat/:token
```

No authentication required. The token is generated when creating a heartbeat monitor.

**Response** `200`

```json
{
  "ok": true
}
```

Example cron job:
```bash
curl -s https://beacon.pluginsynthesis.com/api/v1/heartbeat/your-token-here
```

---

## Uptime Badge

Public SVG badge showing 30-day uptime percentage. No authentication required.

```
GET /api/v1/badge/:monitorId
GET /api/v1/badge/:monitorId?label=custom+label
```

Returns an SVG image. Embed in markdown:

```markdown
![Uptime](https://beacon.pluginsynthesis.com/api/v1/badge/your-monitor-id)
```

| Uptime | Color |
|--------|-------|
| >= 99% | Green |
| >= 95% | Amber |
| < 95%  | Red |

Cached for 5 minutes.

---

## Public Status Data

Get current status for a status page (used by the embeddable widget). No authentication required.

```
GET /api/public/status/:slug
```

**Response** `200`

```json
{
  "status": "operational",
  "name": "Beacon Status",
  "url": "https://beacon.pluginsynthesis.com/s/beacon",
  "components": [
    { "name": "Production API", "status": "up" },
    { "name": "Database", "status": "up" }
  ]
}
```

Overall status is `operational`, `degraded`, or `major_outage`.

CORS enabled (`Access-Control-Allow-Origin: *`). Cached for 60 seconds.

---

## Subscriber Management

### Subscribe to Status Page

```
POST /api/public/subscribe
```

Rate limit: 5 requests per 60 seconds per IP.

```json
{
  "slug": "beacon",
  "email": "user@example.com"
}
```

A confirmation email is sent. The subscription is not active until confirmed.

**Response** `200`

```json
{
  "success": true
}
```

### Confirm Subscription

```
GET /api/public/confirm/:token
```

### Unsubscribe

```
GET /api/public/unsubscribe/:token
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error (check request body) |
| 401 | Missing or invalid API key |
| 403 | Plan doesn't allow this action |
| 404 | Resource not found |
| 429 | Rate limit exceeded (check `Retry-After` header) |
| 500 | Server error |
