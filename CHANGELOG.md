# Changelog

> Notable user-facing and operator-facing changes. Tracks the 2026-Q2 / Q3 design overhaul + differentiator rollouts. See [docs/ROADMAP.md](docs/ROADMAP.md) for the sprint plan and [docs/MCP.md](docs/MCP.md) for the MCP tool reference.

## Unreleased

Nothing scheduled yet — Sprint 6 (auto-branded status pages) is queued.

---

## 2026-05-08 — Sprint 5 (Differentiator #1: Incident Collaboration)

**PR #2** — `feat(incidents): collaboration UI + acknowledge`

### Added

- **Acknowledge state on incidents** — single-click "claim" with timestamp + author. Race-safe (`UPDATE … WHERE acknowledged_at IS NULL`), idempotent, and emits a `system` timeline entry on first ack.
- **Internal comments** — incident updates now have a `kind` field (`status` / `comment` / `system`). Comments are visible to the team but **never** publish to status-page subscribers, and they don't roll up the incident's overall status.
- **`acknowledge_incident`** MCP tool. Tool count: 14 → 15.
- **`add_incident_update` accepts `kind`** in MCP, `/api/v1/...`, and `/api/internal/...`.
- **`@-mention payload** plumbing — `incident_updates.mentions uuid[]` is wired through every API path. UI autocomplete is the next iteration.

### Schema

Migration `0005_sprint5_incident_collab.sql`:

- `incidents.acknowledged_at`, `incidents.acknowledged_by_user_id` (FK → users)
- `incident_update_kind` enum
- `incident_updates.kind`, `.authored_by_user_id`, `.mentions`

### UI (`/incidents/[id]`)

- Header gains an **Acknowledge** action button when the incident is open and unclaimed; flips to "Acknowledged by {user} {ago}" once taken.
- Right rail renamed **Conversation**. Three render variants per entry kind:
  - `status` — incident-state pill
  - `comment` — gradient avatar + "internal" badge in primary tint
  - `system` — clock glyph + italic muted message
- Composer toggles between **Status update** and **Internal comment**. Comment mode hides the status select and posts via the session-authed route, attributing to `ctx.user.id`.

---

## 2026-05-07 — Sprint 7 (Differentiator #3: MCP Server)

Shipped as part of **PR #1** alongside the design overhaul.

### Added

- **`POST /api/mcp`** — native Model Context Protocol endpoint. Stateless JSON-RPC 2.0 over HTTP. Bearer auth via existing `bk_` API keys; cookies not accepted (CSRF-safe).
- **14 MCP tools**: `list_monitors`, `get_monitor`, `create_monitor`, `update_monitor`, `delete_monitor`, `pause_monitor`, `resume_monitor`, `get_check_history`, `get_uptime_stats`, `list_incidents`, `get_incident`, `create_incident`, `add_incident_update`, `list_status_pages`. (Sprint 5 brought the count to 15.)
- **Rate limits** — 60 req/60s shared with `/api/v1/*`, plus a separate 30-write/60s ceiling on `/api/mcp` to slow runaway agent loops.
- **Dashboard MCP rail + Settings MCP info panel** — flip from "Coming soon" to "Available" once an API key is provisioned. Snippet shows the `mcp-remote` invocation.
- **`docs/MCP.md`** — full tool reference, Claude Desktop / Claude Code / Cursor configuration, working `curl` examples.

---

## 2026-05-07 — Sprints 0 / 2 / 3 (Design Overhaul)

Shipped in **PR #1** — `Design overhaul: tokens, primitives, dashboard rebuild`.

### Added

- **Semantic token contract** in `src/app/globals.css`:
  - `--status-up` / `--status-down` / `--status-degraded` / `--status-paused` / `--status-pending` (+ soft halo variants)
  - `--severity-critical` / `--severity-major` / `--severity-minor` / `--severity-none`
  - `--incident-investigating` / `--incident-identified` / `--incident-monitoring` / `--incident-resolved`
  - `--shadow-xs` / `--shadow-sm` / `--shadow-md` / `--shadow-lg`
  - Light + dark values defined for every token.
- **Custom Sweep brand mark** (`src/components/brand/mark.tsx`) — concentric arcs + node + signal line. Replaces the lucide `Activity` placeholder previously used everywhere.
- **Server-renderable Sparkline** (`src/components/charts/sparkline.tsx`) — SVG, no Recharts dep, supports severity-band overlays.
- **Status / severity primitives** (`src/components/dashboard/status-indicators.tsx`) — `StatusDot`, `StatusPill`, `SeverityPill`, `IncidentStatePill`, `TypePill`. Single source of truth — components consume these instead of literal Tailwind colors.

### Changed

- **Sidebar IA**: order is now Dashboard → Incidents → Monitors → Status Pages → Settings (Notifications nests under Settings link). Each item carries a kbd hint (`G D`, `G I`, `G M`, `G S`).
- **Top bar** added: breadcrumb + Cmd-K trigger + theme toggle. Replaces the previous mobile-only hamburger header.
- **Dashboard (`P-DASH`)**: rebuilt around 4 stat cards with sparklines (Uptime 24h, Incidents 24h + MTTR, Avg Response + p95/p99, Monitors), an active-incident banner that only renders when there's an unresolved incident, a dense 36px-row monitor table with expand-to-90-day-uptime, and an Activity / MCP rail.
- **Monitor list (`P-MON-LIST`)** + **Monitor detail (`P-MON-DETAIL`)**: dense-row tables with sparklines; detail page shows breadcrumb, editable name, status + type pills, 6-stat row, response chart with optional incident-band overlays, expandable check history, right rail (related incidents, notification channels, configuration).
- **Incident list (`P-INC-LIST`)** + **Incident detail (`P-INC-DETAIL`)**: severity / state pills throughout; URL-driven filter chips (Open / Resolved / All); detail page has summary card, timeline thread, resolved banner. Sprint 5 layered on Acknowledge + internal comments.
- **Status pages list (`P-SP-LIST`)**: dense rows with brand-color tile, public/private state pills, theme name, slug + custom domain, monitor count, view + edit actions.
- **Settings (`P-SETTINGS`)**: restructured into Profile, API keys & MCP, Notifications, Members, Plan limits, Billing sections.
- **Auth pages (`P-AUTH`)**: BeaconMark, tighter spacing, autocomplete attributes for browser autofill.

### Removed

- Hardcoded status colors (`bg-teal-500`, `bg-red-500`, `bg-amber-500`, `#14b8a6` literal in `response-chart.tsx`, inline reds in `check-history.tsx`, etc.) — all now token-driven.
- `.glow-card`, `.glow-btn`, `.glow-surface` utilities. `.glow-orbs` is preserved on auth surfaces only per the handoff brief.

### Docs

- `docs/design/handoff-2026-q2.md` — full design direction brief
- `docs/design/system.md` — current state baseline audit
- `docs/ROADMAP.md` — 8-sprint plan with per-sprint exit criteria
- `docs/design/screenshots/baseline/` — 16 routes × 2 viewports, the **before**
- `docs/design/screenshots/after-2026-q2/` — same routes after redesign

### Known follow-ups (not blocking)

- Cmd-K palette real implementation (Phase 6 / Sprint 8)
- Mobile monitor-table card layout (responsive pass)
- Activity feed dedup (small polish)
- WebSocket realtime layer (Sprint 5/8)
- WCAG AA pass (Sprint 8)
