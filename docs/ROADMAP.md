# Beacon Uptime — Roadmap (2026-Q2 → Q3)

> **Purpose:** sprint-by-sprint breakdown of the UI overhaul + 3 differentiators. The full plan rationale lives at [/home/straplocked/.claude/plans/we-haven-t-worked-on-squishy-kite.md](../../../.claude/plans/we-haven-t-worked-on-squishy-kite.md).
> **Design docs:** [docs/design/system.md](design/system.md) (baseline audit), [docs/design/handoff-2026-q2.md](design/handoff-2026-q2.md) (design direction).

## Outcome

By the end of this roadmap Beacon Uptime will:
1. Look like a **2026 product** (Linear-density dashboard, light+dark parity, custom mark, accessible).
2. Own three positioning flags that competitors don't: **incident collaboration UI**, **auto-branded status pages**, **native MCP server**.
3. Feel **alive** — WebSocket realtime updates across the dashboard.
4. Be **AA accessible** with a measured score on every rebuilt route.

Total: **8 two-week sprints** (~16 calendar weeks). Compresses to 6 if execution is fast and design+eng are split.

---

## Status (2026-05-08)

| Sprint | Status | Notes |
|---|---|---|
| 0 — Foundations | ✅ Shipped | Handoff brief + system audit + roadmap + 16-route baseline screenshots |
| 1 — Design lock | ✅ Shipped (combined w/ S2/S3) | Token contract committed, Sweep mark chosen |
| 2 — Tokens & primitives | ✅ Shipped (PR #1) | Semantic tokens, Sparkline, status indicators, dashboard shell |
| 3 — Page rebuilds | ✅ Shipped across PR #1 + PR #2 | Auth, Dashboard, Monitors list/detail, Incidents list/detail, Status pages list, Settings |
| 4 — *(rolled into S3)* | — | Monitor detail rebuilt with response chart + percentiles in PR #1's follow-up commits |
| 5 — Differentiator #1 | ✅ Shipped (PR #2) | Incident collab UI + Acknowledge + acknowledge_incident MCP tool |
| 6 — Differentiator #2 | ⏳ Next | Auto-branded status pages |
| 7 — Differentiator #3 | ✅ Shipped (PR #1) | Native MCP server, 15 tools, Settings + Dashboard rails live |
| 8 — Realtime + a11y | ⏳ Pending | WebSockets, Cmd-K real impl, WCAG AA pass |

See [CHANGELOG.md](../CHANGELOG.md) for the per-PR change log.

## Sprint 0 — Foundations (DONE in current session)

Phase 0 + Phase 1 deliverables already exist:
- ✅ [docs/design/system.md](design/system.md) — current state audit
- ✅ [docs/design/handoff-2026-q2.md](design/handoff-2026-q2.md) — design direction brief
- ✅ [docs/ROADMAP.md](ROADMAP.md) — this file
- ✅ [/home/straplocked/.claude/plans/we-haven-t-worked-on-squishy-kite.md](../../../.claude/plans/we-haven-t-worked-on-squishy-kite.md) — full plan

**Outstanding from Phase 0:** capture screenshots of all 17 routes (desktop + mobile widths). This needs the dev server running and is best done with Chrome DevTools MCP. Can happen at the start of Sprint 1.

---

## Sprint 1 — Design Foundation Lock (2 weeks)

**Goal:** Lock the design language and the custom icon mark before any pages get rebuilt.

### Engineering / docs
- [ ] Capture screenshots of all 17 routes via Chrome DevTools MCP at 1440×900 and 390×844 (mobile). Drop in `docs/design/screenshots/baseline/`.
- [ ] Run the hardcoded-color audit and produce a fix-list:
  ```bash
  grep -rEn "#[0-9a-fA-F]{6}|bg-(teal|red|amber|slate|emerald|blue|indigo)-[0-9]+" \
    src/components src/app | grep -v node_modules
  ```
- [ ] Spike: prototype the token contract from §6 of the handoff in a throwaway branch — verify Tailwind v4's `@theme inline` accepts the new `--status-*` / `--severity-*` / `--incident-state-*` tokens cleanly.
- [ ] Add npm deps that Phase 2 will need (no usage yet, just install): `cmdk`, `sonner`.

### Design (parallel)
- [ ] Use `interface-design:init` skill on a single representative page — `P-DASH` — to validate the brief produces output that matches the thesis. If not, iterate on the brief.
- [ ] Custom icon mark: 3-5 directions explored, narrowed to 2 finalists, finalist chosen. SVG + raster exports delivered.
- [ ] Update [docs/design/system.md](design/system.md) and [docs/design/handoff-2026-q2.md](design/handoff-2026-q2.md) with any decisions made during the spike.

**Exit criteria:** baseline screenshots exist; token contract proven to work in Tailwind v4; custom mark ready for Sprint 2 swap.

**Plane epic:** `BU: Design System Foundation`

---

## Sprint 2 — Tokens & Primitives (2 weeks)

**Goal:** All design tokens migrated. All shadcn primitives updated to consume them. New primitives added. No user-visible page changes yet.

### Tasks
- [ ] **Token migration** in [src/app/globals.css](../../src/app/globals.css):
  - Add `--status-up/down/degraded/paused/pending` (light + dark)
  - Add `--severity-critical/major/minor/none` (light + dark)
  - Add `--incident-state-investigating/identified/monitoring/resolved` (light + dark)
  - Add `--shadow-xs/sm/md/lg` (light + dark)
  - Wire all of the above through `@theme inline` so `bg-status-up` etc. work in JSX.
- [ ] **Primitive updates** in [src/components/ui/](../../src/components/ui/):
  - `badge.tsx` — add `severity` and `incident-state` variants
  - `button.tsx` — verify focus ring AA in both themes; add `kbd` indicator for shortcuts
  - `card.tsx` — apply density spec (16/20px padding); use `--shadow-xs` default
- [ ] **New primitives:**
  - `skeleton.tsx` (shadcn skeleton)
  - `toaster` via `sonner` mounted in `app/layout.tsx`
  - `breadcrumb.tsx` (shadcn pattern)
  - `command.tsx` + Cmd-K provider via `cmdk`, mounted in dashboard shell
- [ ] **Custom icon swap:**
  - Replace lucide `Activity` in [src/components/dashboard/dashboard-shell.tsx:105](../../src/components/dashboard/dashboard-shell.tsx) and `:230`
  - Replace in [src/app/(auth)/login/page.tsx](../../src/app/(auth)/login/page.tsx) and `register/page.tsx`
  - Replace `public/favicon.ico` with new mark
  - Update `metadata` in `app/layout.tsx` if needed
- [ ] **Cleanup:** scope `.glow-orbs` to non-dashboard layouts only.

**Exit criteria:** `npm run build` clean; visual scan of all routes shows no regressions (pages still render, just with new tokens); the hardcoded-color grep is near-empty.

**Plane epic:** `BU: Design System Foundation`

---

## Sprint 3 — Auth + Dashboard + Monitor List (2 weeks)

**Goal:** First user-visible redesigned pages. Validate density spec under real content.

### Tasks
- [ ] **`P-AUTH` rebuild** — login + register pages. Tightened spacing, new icon, new type scale. Both themes.
- [ ] **`P-DASH` rebuild** — dashboard becomes the canonical pattern:
  - Active incident banner (only renders when there's an unresolved incident)
  - 4-stat row with sparklines + tabular numerals
  - Dense monitor table (36px rows) with sortable columns and 7-day mini-sparklines
  - Empty state per brief
- [ ] **`P-MON-LIST` rebuild** — monitor list page:
  - Filter chips (status, type)
  - Sort by clicking column headers
  - Multi-select for bulk actions
  - "New monitor" CTA top-right
- [ ] **Component test scaffolding:**
  - Add Vitest + Testing Library deps if not present
  - Smoke tests for the 3 redesigned pages (renders, key elements present, status tokens applied correctly)

**Exit criteria:** 3 pages live in dev. Manual desktop + mobile review passes. Light + dark verified. Tests green.

**Plane epic:** `BU: Page Redesigns`

---

## Sprint 4 — Monitor Detail + Incident List (2 weeks)

**Goal:** The biggest single rebuild (`P-MON-DETAIL`) and a quick win (`P-INC-LIST`).

### Tasks
- [ ] **`P-MON-DETAIL` rebuild:**
  - Header with breadcrumb, editable name, status pill, actions
  - 6-stat row: current status, 24h uptime %, p50, p95, p99, last check
  - **Response chart redesign** in [src/components/monitors/response-chart.tsx](../../src/components/monitors/response-chart.tsx):
    - Token-driven colors (no `#14b8a6` literal)
    - Dark-mode correct grids
    - Status-band overlays during incidents
    - Hover synchronized with check history table below
  - **Check history table** in [src/components/monitors/check-history.tsx](../../src/components/monitors/check-history.tsx):
    - Token-driven status colors (no inline reds)
    - Click row to expand details
  - Right rail: related incidents (last 5), notification channels routing to this monitor, configuration summary
- [ ] **API additions for percentiles:**
  - Extend `/api/internal/monitors/:id/stats` (or create) to return p50/p95/p99 from the existing `hourly_uptime` continuous aggregate
  - These will also be exposed via MCP `get_uptime_stats` in Sprint 7
- [ ] **`P-INC-LIST` rebuild:**
  - Filter: status, severity, time range
  - Severity-tokened cards
  - Empty state

**Exit criteria:** monitor detail page renders correctly with real check data. Response chart works in both themes. Incident list redesigned. p50/p95/p99 visible.

**Plane epic:** `BU: Page Redesigns`

---

## Sprint 5 — Incident Detail + Diff #1 (Incident Collaboration) (2 weeks)

**Goal:** Ship the first differentiator. The incident detail page becomes a Slack-thread-style collaboration surface.

### Schema
- [ ] Migration in [src/lib/db/schema.ts](../../src/lib/db/schema.ts):
  - `incidents.acknowledgedAt timestamptz`
  - `incidents.acknowledgedBy uuid` (FK → `users.id`)
  - `incident_updates.kind text` enum: `'status' | 'comment' | 'system'`
  - `incident_updates.mentions text[]` (user IDs mentioned)
- [ ] Run `npm run db:generate` + `npm run db:migrate`

### API
- [ ] `POST /api/v1/incidents/:id/acknowledge` (new) — patterned on existing pause/resume
- [ ] Extend `POST /api/v1/incidents/:id/updates` to accept `kind` + `mentions`
- [ ] `GET /api/internal/organizations/[id]/members` — for @mention autocomplete (may already exist; verify)

### UI — `P-INC-DETAIL` rebuild
- [ ] Two-column layout: incident detail left, conversation thread right
- [ ] Action bar: **Acknowledge** (one-click), **Add update**, **Resolve**
- [ ] Thread feed: chronological merge of `incident_updates` (status/comment/system kinds), each entry with author avatar, timestamp, content, type pill
- [ ] Compose box reuses [src/components/dashboard/incident-update-form.tsx](../../src/components/dashboard/incident-update-form.tsx) — extend for `kind` toggle and @mention autocomplete
- [ ] @mention pulls from `organization_members`; mentioned user gets an in-app notification (and email if enabled)

### Notifications
- [ ] When `kind='comment'` is added to an incident, do **not** push to status page subscribers (internal-only)
- [ ] When `kind='status'`, *do* push to status page subscribers (existing behavior)
- [ ] @mentions trigger personal notifications via existing notification channels for the mentioned user

**Exit criteria:** acknowledge an active incident via UI, post a threaded comment with @mention, mentioned user gets notified. Existing evaluator tests still pass.

**Plane epic:** `BU: Incident Collaboration`

---

## Sprint 6 — Status Pages + Diff #2 (Auto-Branded) + Settings (2 weeks)

**Goal:** Second differentiator + Settings IA cleanup.

### Tasks
- [ ] **`P-SP-LIST` rebuild** — card grid, three template thumbnails on empty state
- [ ] **`P-SP-EDIT` rebuild** — tabbed form preserved, redesigned. Live preview rail on the right.
- [ ] **Diff #2: Auto-Branded Status Pages**
  - Add npm dep: `node-vibrant` (or `sharp` + custom k-means)
  - New endpoint: `POST /api/internal/status-pages/extract-palette`
    - Accepts `{ faviconUrl: string }`
    - Server-side fetch with timeout (3s)
    - Color quantize, return 5-color palette
  - UI in Theme tab: "Extract from favicon" input + "Extract palette" button → 5 swatches → user maps to brand/accent/surface
  - Integrates with existing brand color picker (extraction populates the field)
- [ ] **`P-SETTINGS` rebuild + IA shift:**
  - Sections: Profile, Notifications (moved from `/notifications`), API keys & MCP, Members, Billing, Plan limits
  - Notifications page content moves into the Settings shell — old `/notifications` redirects to `/settings#notifications`
  - "API keys & MCP" section gets an MCP info panel above the API key list (linked to `docs/MCP.md` which Sprint 7 produces)
- [ ] **Sidebar IA update** in [src/components/dashboard/dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx):
  - Reorder: Dashboard, Incidents, Monitors, Status Pages, Settings
  - Remove Notifications from top-level
  - Add Cmd-K trigger button

### `P-PUBLIC` light touch
- [ ] Verify token rename doesn't break the 5 existing themes; tighten public page typography to match new dashboard scale

**Exit criteria:** paste a favicon URL, see palette extracted and applied; public page renders correctly. Settings IA matches handoff brief. Old `/notifications` redirects.

**Plane epic:** `BU: Auto-branded Status Pages` + `BU: Page Redesigns`

---

## Sprint 7 — Diff #3 (MCP Server) + Realtime Foundation (2 weeks)

**Goal:** Third differentiator + start the WebSocket layer.

### Diff #3: MCP Server
- [ ] Add npm dep: `@modelcontextprotocol/sdk`
- [ ] **Service refactor:** extract pure service functions from existing v1 route handlers into [src/lib/services/](../../src/lib/services/) — one module per resource (`monitors.ts`, `incidents.ts`, `status-pages.ts`, `checks.ts`). Both REST and MCP call these.
- [ ] **MCP route:** create `src/app/api/mcp/route.ts` patterned on Strawberry Notes pattern
  - `POST` handler with `WebStandardStreamableHTTPServerTransport`
  - `sessionIdGenerator: undefined`, `enableJsonResponse: true`
  - `GET` and `DELETE` return 405
- [ ] **MCP server:** create `src/lib/mcp/server.ts`
  - `buildMcpServer(organizationId)` factory — binds org context to server instance
  - Register all tools (see plan §Phase 4 Diff #3 for full list — ~20 tools across monitors, checks, incidents, status pages, heartbeat)
  - Each tool uses Zod schema mirroring existing v1 request validation
- [ ] **Auth:**
  - Add `requireApiKey()` helper in [src/lib/auth/](../../src/lib/auth/) patterned on Strawberry's `requireBearerUserId`
  - Reuse existing `bk_` API key system (no new token type)
  - No cookie auth on `/api/mcp`
- [ ] **Rate limit hardening:** add a separate, lower limit for **write** operations on `/api/mcp` (e.g. 10 writes per 60s) on top of the existing 60/60s read limit. Implement in [src/lib/rate-limit.ts](../../src/lib/rate-limit.ts).
- [ ] **Docs:** create `docs/MCP.md` with tool reference, Claude Desktop config example using `mcp-remote`, `curl` testing examples
- [ ] **Settings UI:** add MCP info panel above the API key list (link to `docs/MCP.md` from Settings page)
- [ ] **README update:** add an MCP section to `README.md`

### Realtime Foundation (start)
- [ ] Architecture decision recorded in `docs/technical/realtime.md`: sidecar WebSocket service vs Next.js custom server
- [ ] If sidecar (recommended): scaffold `src/worker/realtime.ts` with the BullMQ event subscription loop
- [ ] Postgres LISTEN/NOTIFY channel on monitor status changes (DB trigger if not already in place)
- [ ] Auth ticket endpoint: `POST /api/internal/realtime/ticket` (session-authed → signed short-lived JWT)
- [ ] Add WS service to [docker-compose.yml](../../docker-compose.yml) and [docker-compose.prod.yml](../../docker-compose.prod.yml)

**Exit criteria:** Configure Claude Desktop with `/api/mcp` via `mcp-remote`; tools appear; smoke test passes (`list_monitors`, `create_monitor`, `get_uptime_stats`, `acknowledge_incident`, `add_incident_update`). Cross-org isolation verified. WS sidecar scaffolded but not yet consuming events.

**Plane epics:** `BU: MCP Server` + `BU: Realtime via WebSockets` (start)

---

## Sprint 8 — Realtime Finish + A11y / Hardening (2 weeks)

**Goal:** Realtime live across the dashboard. WCAG AA on every rebuilt page.

### Realtime
- [ ] **Sidecar event consumption:**
  - BullMQ events → broadcast to org channel
  - Postgres LISTEN/NOTIFY events → broadcast to org channel
- [ ] **Client side:**
  - `useRealtimeStore` hook (Zustand) that mirrors org state
  - Merges WS events into TanStack Query caches via cache invalidation
  - Connection state indicator in user dropdown (green/amber/red dot)
- [ ] **Surfaces wired up:** Dashboard, Monitor list, Monitor detail, Incident list, Incident detail
- [ ] **Realtime visual language** per handoff §9: subtle background tint on numeric updates, cross-fade on status dot color changes, slide-in/fade-out for list rows

### A11y / Hardening (Phase 6)
- [ ] **WCAG AA pass** with `design:accessibility-review` on every redesigned route
- [ ] **Focus management:** wrap all dialogs in focus traps (the `@base-ui/react` Dialog needs configuration)
- [ ] **Keyboard navigation:**
  - Cmd-K command palette (already mounted in Sprint 2; populate it now with monitors/incidents/actions)
  - `g d` / `g m` / `g i` global shortcuts
  - `j/k` list nav on dashboard, monitors, incidents
  - `?` opens shortcut overlay
- [ ] **Skip link** to main content
- [ ] **Heading hierarchy** consistent on every page (one `h1`, structured `h2`/`h3`)
- [ ] **`aria-live` regions** for status changes
- [ ] **Touch targets** ≥44px on mobile
- [ ] **Lighthouse a11y score** ≥95 on dashboard and monitor detail
- [ ] **Component tests** for the 9 rebuilt page IDs

**Exit criteria:** open dashboard in two browser tabs, trigger a monitor down event in worker, both tabs reflect immediately without refresh. Lighthouse a11y ≥95 on dashboard and monitor detail. Keyboard-only user can navigate every page.

**Plane epics:** `BU: Realtime via WebSockets` (finish) + `BU: Accessibility & Hardening`

---

## Cross-Sprint: End-to-End Smoke

After Sprint 8, run the full smoke per the plan:

1. `docker compose up -d` (in main checkout, not worktree — per project memory)
2. Run migrations + seed demo data
3. Open `localhost:3100`
4. Login → create monitor → wait for first check
5. Trigger downtime (e.g. block the target URL)
6. Verify incident auto-created
7. Acknowledge it from the new UI
8. Post a threaded comment with @mention
9. Verify it streams to a second tab via WebSocket
10. Publish a status page using auto-branded palette
11. Confirm public page renders correctly with extracted brand colors
12. From a separate terminal, hit `/api/mcp` with a fresh API key and call `list_incidents`
13. Verify the just-created incident is returned

If that whole flow feels good, the overhaul is real.

---

## After This Roadmap (Parking Lot for Future Sprints)

Once the 8 sprints land, the parking-lot items become the natural next-quarter roadmap. Roughly prioritized:

### Q3 candidates
- **PagerDuty + ntfy + Telegram + Teams + Opsgenie** notification channels (Kuma has 95+; we have 4. The IA in Settings already accommodates them.)
- **On-call schedules + escalation policies** — the next missing-from-OSS feature after incident collab
- **Audit logging** — user action history, retention, exportable
- **Sentry / OpenTelemetry integration** — production observability for Beacon itself
- **SMS** notifications via Twilio (paid only)

### Q4 candidates
- **Observability bridges** — correlate uptime drops with log/metric anomalies (DataDog, Loki, Prometheus webhooks)
- **Bidirectional UI ↔ YAML config sync** — appeals to GitOps users without alienating UI users
- **Incident postmortem / cause-analysis fields** + auto-generated postmortem drafts via the MCP tools
- **Historical analytics + anomaly detection** — "Fridays have 3x more downtime"
- **Multi-region check distribution** — schema already supports `regions`; needs worker fleet management
- **Public OSS launch / "Show HN" push** — once Q2 + Q3 land

### Maintenance / debt
- Test coverage expansion — current 9 test files cover business logic; route + component coverage will be partial after Sprint 8
- Database backup strategy in `docker-compose.prod.yml`
- Secrets rotation policy for API keys
- CSP headers
- Comprehensive `/health` endpoint (currently basic)

---

## Tracking

Each sprint maps to one or more Plane epics in the **BU** project at `plane.pluginsynthesis.com`:

| Plane epic | Spans sprints |
|---|---|
| BU: Design System Foundation | 1, 2 |
| BU: Page Redesigns | 3, 4, 6 |
| BU: Incident Collaboration (Diff #1) | 5 |
| BU: Auto-branded Status Pages (Diff #2) | 6 |
| BU: MCP Server (Diff #3) | 7 |
| BU: Realtime via WebSockets | 7, 8 |
| BU: Accessibility & Hardening | 8 |

Per-sprint child tickets should reference the Page IDs from the handoff brief (`P-DASH`, `P-MON-DETAIL`, etc.) so design files and PRs cross-reference cleanly.

---

## Compression Options

If 16 weeks is too long, here's how to compress:

- **Drop to 12 weeks:** parallelize Sprint 4 + 5 (different engineers) and Sprint 6 + 7 (Diff #2 is a small feature, can ride alongside Diff #3).
- **Drop to 10 weeks:** also defer Sprint 8's a11y work to a follow-up release. *Not recommended* — shipping with 30% AA undermines the positioning.
- **Drop to 8 weeks:** also descope Diff #3 (MCP) to Q3. *Not recommended* — MCP is the strongest 2026 positioning angle and the implementation is small.

If 16 weeks is too short, the most likely cause is the WebSocket layer (Sprint 7+8 split). Fallback: cut to SSE on the 5 priority surfaces only — the user-visible behavior is identical for the read-heavy use cases.
