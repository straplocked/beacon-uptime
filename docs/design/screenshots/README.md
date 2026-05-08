# Baseline Screenshots — 2026-Q2 UI Overhaul

Captured at the start of the redesign as the **before** picture. Re-capture at the end of the overhaul to produce the **after**.

## Files

```
baseline/
  desktop/    1440×900 viewport, full page where applicable, PNG
  mobile/     390×844 viewport, full page where applicable, PNG
```

16 routes, 32 files total. ~14MB. Captured against demo seed data via headless Chrome (Playwright + system Chrome).

## Capture parameters

- **Viewport:** desktop 1440×900, mobile 390×844
- **Color scheme:** forced dark (`prefers-color-scheme: dark`) — the project's default
- **Auth:** logged in as `demo@beacon.local` / `password123`
- **Wait condition:** `networkidle` + 400ms settle
- **Full page:** yes for content pages; no for login/register (centered cards)

## Reproduce

The capture script is not committed (it was a one-off using `playwright-core` from `/tmp`). To reproduce:

```bash
mkdir -p /tmp/beacon-shots && cd /tmp/beacon-shots
npm init -y && npm install --no-save playwright-core
# Copy take.mjs from git history (commit that added screenshots) or rewrite from this README
node take.mjs
```

Pre-requisites: docker stack running (`docker compose up -d`), demo data seeded, dev server reachable at `http://localhost:3100`, system Chrome at `/usr/bin/google-chrome`.

## Findings surfaced from baseline

These are real bugs/debt items the screenshots revealed. Tracked for Sprint 1+ work.

1. **Dark-mode inconsistency** — dashboard renders fully dark; monitor detail page renders dark sidebar + light content area. The `.dark` class isn't consistently propagating to all Card surfaces. (See `desktop/04-dashboard.png` vs `desktop/07-monitor-detail.png`.)
2. **Response chart hardcoded color** — visible teal stroke that doesn't follow theme tokens. (`desktop/07-monitor-detail.png`.)
3. **Inconsistent surface treatment** — cards on monitor detail are white/transparent while cards on dashboard are dark. Symptom of the same dark-mode issue.

These confirm the [system.md](../system.md) audit findings and validate the Phase 2 token migration is the right next step.
