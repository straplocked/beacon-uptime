# MCP Server

Beacon Uptime exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at `POST /api/mcp`. Any MCP-compatible client (Claude Desktop, Claude Code, Cursor, custom SDK clients) can connect, authenticate with an API key, and act on the signed-in organization through a small tool set.

The endpoint re-exposes the existing `/api/v1/*` REST surface. Everything the endpoint can do, an authenticated `curl` against `/api/v1/monitors` etc. can also do.

> **Pattern note:** the implementation closely follows the [Strawberry Notes MCP server](https://github.com/straplocked/strawberry-notes/blob/main/docs/technical/mcp.md). Same stateless transport, same Bearer-only auth model, same "tools mirror REST" philosophy.

---

## Endpoint

| Method | Path        | Purpose                                                  |
| ------ | ----------- | -------------------------------------------------------- |
| POST   | `/api/mcp`  | Single-message, stateless JSON-RPC 2.0 over HTTP.        |
| GET    | `/api/mcp`  | 405 — streaming is not supported in v1.                  |
| DELETE | `/api/mcp`  | 405 — session termination is not supported in v1.        |

Implementation: [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts) using `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`. Every request is independent: no session state, no SSE, no subscriptions.

---

## Authentication

`Authorization: Bearer bk_<...>` is **required**. Cookie auth is not accepted on `/api/mcp` — this avoids CSRF from a browser with a Beacon session open.

### Provisioning a key

1. Sign into Beacon Uptime in a browser.
2. Go to **Settings** → **API keys & MCP**.
3. Click **Generate API Key**. The token is shown **once**; the server keeps the raw value for now (rotated to a hashed store in a future hardening pass).
4. Use the token in the `Authorization` header. Format: `bk_` + 64 hex characters (32 random bytes).

Tokens are revocable on the same page. A revoked token fails all future `/api/mcp` calls with `401`.

### Plan gating

API access is gated to Pro / Team plans on the SaaS edition. The OSS edition (`BEACON_EDITION` unset or anything other than `saas`) returns API access for all plans — you'll see all 14 tools. See [`src/lib/edition.ts`](../src/lib/edition.ts).

### Rate limits

- 60 requests / 60 seconds per API key (shared with `/api/v1/*`)
- 30 writes / 60 seconds per API key (extra ceiling on `/api/mcp` to slow runaway agent loops)

Both limits return `429` with a `Retry-After` header. See [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts).

---

## Tool Reference

All tools act on the authenticated organization. Cross-org access is structurally impossible — the org id is bound to the server instance at request time and never comes from tool arguments.

### Monitors

| Tool                | Inputs                                                                                                                          | Result                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `list_monitors`     | —                                                                                                                               | Array of monitors (id, name, type, target, status). |
| `get_monitor`       | `id` (uuid)                                                                                                                     | Full monitor record.                                |
| `create_monitor`    | `name`, `type` (http\|ping\|tcp\|dns\|ssl\|heartbeat), `target`, `intervalSeconds?`, `timeoutMs?`, `expectedStatusCode?`, `method?` | Created monitor (heartbeat type returns the token). |
| `update_monitor`    | `id`, plus any of `name`, `target`, `intervalSeconds`, `timeoutMs`, `expectedStatusCode`, `method`                              | Updated monitor.                                    |
| `delete_monitor`    | `id`                                                                                                                            | Confirmation message.                               |
| `pause_monitor`     | `id`                                                                                                                            | Confirmation; monitor will not be checked.          |
| `resume_monitor`    | `id`                                                                                                                            | Confirmation; status returns to `pending`.          |

### Checks & analytics

| Tool                 | Inputs                                                                                          | Result                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `get_check_history`  | `monitorId`, `limit?` (max 200, default 50)                                                     | Array of checks (time, status, response time, status code, error, region) — newest first.            |
| `get_uptime_stats`   | `monitorId`, `window` (`24h` \| `7d` \| `30d`)                                                  | Object with `uptimePercent`, `avgResponseMs`, `p50Ms`, `p95Ms`, `p99Ms`, `sampleCount`.               |

### Incidents

| Tool                  | Inputs                                                                                                                            | Result                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `list_incidents`      | `openOnly?` (default false), `limit?` (max 200, default 50)                                                                       | Array of incidents (id, title, status, impact, dates).  |
| `get_incident`        | `id`                                                                                                                              | Incident + full update timeline.                        |
| `create_incident`     | `statusPageId`, `title`, `impact?` (none\|minor\|major\|critical), `status?` (investigating\|identified\|monitoring\|resolved), `message?` | Created incident.                                       |
| `add_incident_update` | `incidentId`, `status`, `message`                                                                                                 | Created update; rolls up incident status automatically. |

### Status pages

| Tool                | Inputs | Result                                              |
| ------------------- | ------ | --------------------------------------------------- |
| `list_status_pages` | —      | Array of pages (id, name, slug, custom domain, theme, brand color, public). |

### Tool limits

- `list_monitors` and `list_incidents` cap at 200.
- `get_check_history` clamps `limit` to [1, 200] server-side.
- `title` max 200 chars, `name` max 100 chars.

---

## Client Configuration

### Claude Desktop

Config locations: macOS `~/Library/Application Support/Claude/claude_desktop_config.json` · Linux `~/.config/Claude/claude_desktop_config.json` · Windows `%APPDATA%\Claude\claude_desktop_config.json`.

**Recommended — wrap with `mcp-remote`.** Some Claude Desktop builds drop entries whose shape they don't recognise (remote-URL servers get stripped on Linux/Windows). Wrapping the HTTP endpoint with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) presents it as stdio, which Desktop preserves:

```json
{
  "mcpServers": {
    "beacon-uptime": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://beacon.example.com/api/mcp",
        "--header",
        "Authorization:${BEACON_TOKEN}"
      ],
      "env": {
        "BEACON_TOKEN": "Bearer bk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

`mcp-remote` substitutes `${BEACON_TOKEN}` from `env` into the `Authorization` header, so the raw token stays out of `args`.

**Direct URL form** — works on builds that speak MCP Streamable HTTP natively; may be silently dropped on others:

```json
{
  "mcpServers": {
    "beacon-uptime": {
      "url": "https://beacon.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer bk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop after editing. The Beacon Uptime tools should appear in the tool picker.

### Claude Code

Add a `.mcp.json` at the project root or invoke `claude mcp add` from the CLI:

```bash
claude mcp add beacon-uptime --url https://beacon.example.com/api/mcp \
  --header "Authorization: Bearer bk_..."
```

### Cursor

`Settings → MCP → Add new MCP server`. Same shape as Claude Desktop.

### Testing with `curl`

```bash
# List all tools
curl -s -X POST http://localhost:3100/api/mcp \
  -H "Authorization: Bearer bk_..." \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call list_monitors
curl -s -X POST http://localhost:3100/api/mcp \
  -H "Authorization: Bearer bk_..." \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_monitors",
      "arguments": {}
    }
  }'

# Call get_uptime_stats for a monitor
curl -s -X POST http://localhost:3100/api/mcp \
  -H "Authorization: Bearer bk_..." \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_uptime_stats",
      "arguments": { "monitorId": "<uuid>", "window": "24h" }
    }
  }'
```

---

## Use Cases

Things an MCP-aware agent can do that the dashboard alone can't easily script:

- **"What services were down last week?"** → `list_incidents` with `openOnly: false`, then filter by `createdAt`.
- **"Create monitors for every URL in this PR's deploy preview"** → `create_monitor` in a loop.
- **"Acknowledge the API outage and post 'investigating'"** → `add_incident_update` with `status: 'investigating'`.
- **"Generate a postmortem from Tuesday's incident"** → `get_incident` + LLM reasoning over the returned timeline.
- **Daily standup bot** → `get_uptime_stats` for each critical monitor, summarized in chat.

---

## Security Notes

- API keys grant the same access as the v1 REST surface. Treat them like passwords; use one per client where possible and revoke on compromise. (Multi-key support per organization is on the parking lot.)
- The endpoint does not participate in cookie-based auth — it cannot be triggered from a malicious page in the user's browser.
- A revoked or unknown bearer fails with `401`.
- Rate limits run in front of the tool dispatch — exhausting them returns `429` before any DB work.
- Heartbeat tokens (issued per heartbeat-type monitor) are a separate auth model and are NOT accepted on `/api/mcp`. They remain scoped to `/api/v1/heartbeat/:token`.

---

## Implementation Map

- Endpoint: [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts)
- Server + tools: [`src/lib/mcp/server.ts`](../src/lib/mcp/server.ts)
- Bearer resolver: [`src/lib/auth/api-key.ts`](../src/lib/auth/api-key.ts) — exports `resolveApiKey()` and the existing `getApiKeyOrg()` NextRequest wrapper used by `/api/v1/*`
- Rate limiter: [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) — `rateLimit()` (string-key) + `withRateLimit()` (NextRequest wrapper)
- Schema: existing `monitors`, `check_results`, `incidents`, `incident_updates`, `status_pages` tables in [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) — no new schema for v1

---

## Roadmap

- **`acknowledge_incident`** tool lands once Sprint 5 adds `incidents.acknowledgedAt` / `acknowledgedBy` (Differentiator #1).
- **`extract_status_page_palette`** tool lands once Sprint 6 implements palette extraction from a favicon URL (Differentiator #2).
- **Per-tool telemetry** (last call timestamp, count) — captured for the live MCP rail.
- **Hashed token storage** — current implementation stores the raw key on `organizations.apiKey`; a future hardening pass moves this to a `api_tokens` table with SHA-256 hashes and per-token names/scopes.
- **Streaming** (`GET /api/mcp` with SSE) — only valuable once we add long-running tools.
