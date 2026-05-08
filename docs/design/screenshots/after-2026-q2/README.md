# After Screenshots — 2026-Q2 Dashboard Rebuild

`/dashboard` rendered against the new design (Sprint 3 P-DASH work landed early via Claude Design handoff).

## Files

```
after-2026-q2/
  desktop/
    dashboard.png         dark mode, 1440×900, full page
    dashboard-light.png   light mode, 1440×900, full page
  mobile/
    dashboard.png         dark mode, 390×844, full page
    dashboard-light.png   light mode, 390×844, full page
```

## What changed (vs `baseline/desktop/04-dashboard.png`)

- **New brand mark.** Custom "Sweep" SVG (concentric arcs + node + signal line) replaces the lucide `Activity` placeholder.
- **Proposed sidebar IA.** Order is Dashboard → Incidents → Monitors → Status Pages → Settings. Notifications nests under Settings (no top-level entry). Each item has a kbd hint (`G D`, `G I`, `G M`, `G S`).
- **Sidebar foot.** Cmd-K trigger, user row with conn-dot (currently static green; wires up to WebSockets in Phase 5).
- **Top bar.** Breadcrumb, search button, theme toggle. Replaces the previous mobile-only hamburger header.
- **Stat cards.** 4 metrics with sparklines: Uptime · 24h, Incidents · 24h (+ MTTR), Avg Response (+ p95/p99), Monitors. Tabular numerals, deltas with directional arrows, severity-tinted bands on the response sparkline.
- **Active incident banner.** Renders only when an unresolved incident exists. Severity left-border, severity + state pills, ack metadata, "Open thread" CTA.
- **Dense monitor table.** 36px rows. Status dot (with halo), monitor name + target (mono), type pill, status pill, 48-check sparkline (severity-banded), response time (mono tabular), last-check ago, expand-to-90-day-uptime.
- **Right rail.** Activity feed (system + comment events) + MCP rail (announcing the upcoming agent integration with the `bk_` setup snippet).

## Token contract

All status / severity / incident-state colors come from semantic tokens in `src/app/globals.css` (`--status-*`, `--severity-*`, `--incident-*`, `--shadow-*`). Light + dark values defined for every token. No hex literals or Tailwind color classes used.

## Reproducing locally

```bash
docker compose up -d                          # main checkout
# Wait for app + worker + scheduler to be healthy
# Point a browser at http://localhost:3100/dashboard
```

The capture pipeline used `playwright-core` against `/usr/bin/google-chrome`, headless, demo seed data. The script was a one-off in `/tmp` and is not committed; the baseline `screenshots/README.md` documents the reproduction recipe.

## Known follow-ups (not blocking)

- **Activity feed deduplication.** Current builder mixes `incidents` rows and `incident_updates` rows; a single incident can appear twice when both sources have entries. Polish during Sprint 5 when the incident-collab schema additions land.
- **Activity feed message formatting.** Currently renders as `"<incidentTitle>: <updateMessage>"` which reads awkwardly when the title already contains the monitor name. Polish during Sprint 5.
- **Mobile monitor table.** Falls back to horizontal scroll on small viewports. The Claude Design prototype has a card-mode mobile layout — not yet ported. Address during Sprint 3 mobile pass.
- **MCP rail copy.** Currently shows "Coming soon" since the MCP server itself isn't wired. Will switch to live status (tool count + last call) once Sprint 7 ships the endpoint.
- **Cmd-K palette.** Visual trigger present, no functionality. Real implementation in Phase 6.
