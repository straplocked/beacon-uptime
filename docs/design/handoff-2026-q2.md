# Beacon Uptime — Claude Design Handoff (2026-Q2)

> **Audience:** the designer (or the `interface-design:init` skill when invoked).
> **Purpose:** brief everything needed to redesign the Beacon Uptime dashboard so it looks like a 2026 product, not a Kuma-with-paint-job.
> **Companion docs:** [system.md](system.md) (current state baseline), [../../ROADMAP.md](../../ROADMAP.md) (sprint sequencing), [/home/straplocked/.claude/plans/we-haven-t-worked-on-squishy-kite.md](../../../../.claude/plans/we-haven-t-worked-on-squishy-kite.md) (full plan).

---

## 1. Positioning Thesis

Beacon Uptime is the **OSS uptime monitor that takes incident response seriously, exposes itself to AI agents natively, and looks like a 2026 product**.

The OSS uptime field is crowded but predictable: Uptime Kuma owns market share on UX rigor + 95+ notification channels; Kener owns "modern aesthetic"; Gatus owns config-as-code; Statping-ng owns status pages; Better Stack owns paid workflow. Nobody in the OSS bracket meaningfully owns:
1. **Incident collaboration** — Slack-thread-style triage on the incident page
2. **Brand-aware status pages** — auto-extract palette from a favicon
3. **First-class AI agent integration** — native MCP server exposing the full surface

These are Beacon's three flags. The visual redesign exists to make those flags credible.

**Tone:** confident, technical, calm. Not playful. Not corporate. Think *Linear* and *Plain*, not *Notion* and *Asana*. The user is probably an SRE or a small-team founder; they want a tool that respects their time.

---

## 2. References to Mimic (Exactly Three)

| Reference | What to take | What NOT to take |
|---|---|---|
| **Linear** ([linear.app](https://linear.app)) | Density, type rhythm, keyboard primacy, the "tool not CMS" feel, command palette UX | The purple. Don't do purple. Don't do Linear's marketing aesthetic on the app surface. |
| **Vercel observability dashboards** ([vercel.com/dashboard](https://vercel.com/dashboard) — analytics tab) | Chart treatment (sparse axes, soft grids, status-band overlays), monospace numerals for stats, the "data first" hierarchy | Vercel-black backgrounds in light mode. Ship parity. |
| **Plain** ([plain.com](https://plain.com)) | Incident timeline thread UX, the way a "conversation about a problem" feels native to the page, presence indicators | Customer-support framing. Beacon is operational, not customer-facing. |

That's it. Three references. Do not add more — every additional reference dilutes the direction.

---

## 3. Anti-patterns (Things That Break the Brief)

- **No Linear-purple clone.** Beacon's accent is teal-cyan. Stay there.
- **No glassmorphism orbs in the dashboard surface.** The current `.glow-orbs` in [src/app/globals.css](../../src/app/globals.css) lines 199-232 is acceptable on auth/marketing pages, *off-brand* on the dashboard. Remove from `(dashboard)` layout.
- **No Kuma-style uniform monitor wallpaper.** Kuma's signature is a grid of identical status boxes filling the dashboard. It's information-dense but visually monotonous. Beacon should give the dashboard a real hierarchy: incidents first, monitors second, stats as ambient context.
- **No Notion-airy spacing.** Beacon is a tool. Tight is right.
- **No glass / blur surfaces** on dashboard cards. Solid surfaces with subtle elevation only.
- **No emoji-as-status-icons.** Status uses semantic color + glyph. No 🟢🔴.
- **No confetti, no "you did it!" microcopy.** This product runs while users sleep. Dignity over delight.
- **No "AI ✨" badges** in the UI. The MCP integration is meaningful infrastructure, not a marketing sticker. Document it in Settings, don't sprinkle sparkle icons.
- **No multi-color charts for single-series data.** A response-time chart is one line. One color. Use color to encode meaning (status), not ornament.

---

## 4. Information Architecture Diff

### Current sidebar order
1. Dashboard
2. Monitors
3. Status Pages
4. Incidents
5. Notifications
6. Settings

### Proposed sidebar order
1. Dashboard
2. **Incidents** *(promoted — it's the action surface)*
3. Monitors
4. Status Pages
5. Settings
   - Notifications *(demoted from top-level)*
   - Members
   - API keys & MCP
   - Billing (SaaS only)

### Add globally
- **Cmd-K command palette.** Triggered via `⌘K` / `Ctrl+K`. Searches monitors by name, jumps to pages, executes actions ("Pause monitor X", "Acknowledge incident Y", "Create monitor"). Owned by `cmdk` library — see Phase 2.
- **Breadcrumbs** on detail pages. Replaces the current "← Back" buttons.
- **Keyboard shortcuts:** `g d` → dashboard, `g m` → monitors, `g i` → incidents, `j/k` → list nav, `?` → shortcut overlay, `n` → new (context-aware: new monitor / new incident).

### Remove
- The "← Back" button pattern on detail pages — replaced by breadcrumbs.
- The standalone `/notifications` route — its content moves into a `Notifications` section on `/settings`.

---

## 5. Page IDs

These IDs are stable across design files, Plane tickets, and PRs. Use them.

| ID | Routes | Phase 3 priority | Differentiator |
|---|---|---|---|
| `P-AUTH` | `/login`, `/register` | 1 | — |
| `P-DASH` | `/dashboard` | 2 (canonical) | — |
| `P-MON-LIST` | `/monitors`, `/monitors/new` | 3 | — |
| `P-MON-DETAIL` | `/monitors/[id]` | 4 (biggest) | — |
| `P-INC-LIST` | `/incidents`, `/incidents/new` | 5 | — |
| `P-INC-DETAIL` | `/incidents/[id]` | 6 | **Diff #1** lands here |
| `P-SP-LIST` | `/status-pages` | 7 | — |
| `P-SP-EDIT` | `/status-pages/new`, `/status-pages/[id]/edit` | 7 | **Diff #2** lands here |
| `P-SETTINGS` | `/settings`, `/settings/members`, `Notifications` (sub-route) | 8 | **Diff #3** docs link surfaces here |
| `P-PUBLIC` | `/s/[slug]` | 9 (light touch) | — |

---

## 6. Token Contract

**The designer must not bypass these tokens.** All status, severity, and incident-state colors come from this list. If a use case isn't covered, propose a new token; don't reach for `bg-red-500`.

### Status (monitor live state)

| Token | Light value (sketch) | Dark value (sketch) | Used for |
|---|---|---|---|
| `--status-up` | oklch(0.62 0.16 165) — teal-green | oklch(0.72 0.17 165) | Monitor returning successful checks |
| `--status-degraded` | oklch(0.75 0.17 75) — amber | oklch(0.80 0.18 75) | Slow, partial failure, SSL near expiry |
| `--status-down` | oklch(0.58 0.22 25) — red-orange | oklch(0.68 0.22 25) | Monitor failing |
| `--status-paused` | oklch(0.65 0.02 250) — neutral gray | oklch(0.55 0.02 250) | Manually paused |
| `--status-pending` | oklch(0.72 0.05 250) — soft blue-gray | oklch(0.62 0.05 250) | Newly created, awaiting first check |

The values above are **starting points** — the designer may tune them. The names are fixed.

### Severity (incident impact)

| Token | Used for |
|---|---|
| `--severity-critical` | Total outage, customer-impacting |
| `--severity-major` | Partial outage, significant degradation |
| `--severity-minor` | Single non-critical service, cosmetic |
| `--severity-none` | Investigative / informational |

### Incident state (workflow position)

| Token | Used for |
|---|---|
| `--incident-state-investigating` | Initial state |
| `--incident-state-identified` | Cause known, fix in progress |
| `--incident-state-monitoring` | Fix deployed, watching for stability |
| `--incident-state-resolved` | Closed |

### Existing tokens (preserve, do not rename)

- `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- `--chart-1` through `--chart-5`
- `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, etc.
- All `--sp-*` tokens used by [src/lib/status-themes.ts](../../src/lib/status-themes.ts) — these are *user-facing themes for public status pages*, not dashboard colors. Do not consolidate.

### Surface elevation tokens (new)

| Token | Light | Dark |
|---|---|---|
| `--shadow-xs` | inset hairline | inset hairline |
| `--shadow-sm` | 0 1px 2px / 4% | 0 1px 2px / 24% |
| `--shadow-md` | 0 4px 12px / 6% | 0 6px 16px / 36% |
| `--shadow-lg` | 0 16px 40px / 8% | 0 24px 56px / 48% |

Define these explicitly. Pop-ups use md, modals use lg. Cards by default use only the existing `--border` (no shadow on default state).

---

## 7. Density Spec — Linear-tight

### Base unit: 4px

| Element | Height | Notes |
|---|---|---|
| Table row | 36px | Single line of `text-sm` + 8px vertical padding |
| Sidebar item | 32px | Same as Linear |
| Top-level button (default) | 32px | `h-8` |
| Compact button (`size="sm"`) | 28px | `h-7` |
| Input field | 32px | Same as button |
| Avatar (sidebar) | 24px | Smaller than current 32px |
| Tab strip | 36px | |
| Card padding | 16px / 20px | 16 for compact, 20 for default. Down from current 24. |
| Page padding | 24px desktop / 16px mobile | Down from current 32px lg. |
| Section gap | 24px | Down from current 32px (`space-y-8`). |

### Type scale

Map shadcn defaults to a real scale. All values use Inter unless noted.

| Token | px / line-height | Use |
|---|---|---|
| `text-display` | 32 / 1.2 (Space Grotesk 700) | Page titles, marketing |
| `text-h1` | 24 / 1.25 | Page heading |
| `text-h2` | 18 / 1.4 | Section heading |
| `text-h3` | 16 / 1.4, 600 weight | Card title |
| `text-body` | 14 / 1.5 | Default body |
| `text-sm` | 13 / 1.45 | Secondary, meta |
| `text-xs` | 12 / 1.4 | Badges, captions |
| `text-mono-num` | 13, JetBrains Mono, tabular-nums | Stat values, response times, timestamps |

**Tabular numerals are mandatory** for any column or stat showing numbers (uptime %, response time, p50/p95/p99). Use `font-variant-numeric: tabular-nums` on the wrapper.

---

## 8. Light/Dark Parity

Both themes are first-class. Every screen must be designed in both. The handoff is **not accepted** until both versions exist for every Page ID.

Specific watchouts:
- **Don't dim the light theme** to make the dark theme look better by comparison. Both should look intentional.
- **Status colors must hit AA contrast** against `--background` *and* `--card` in both themes. Run the math.
- **Charts** especially fail this — soft grids that read fine on dark `--card` (oklch 0.20) often disappear on light `--card` (oklch 1.0). Ship two grid colors if needed.
- **Default theme:** match OS preference (current behavior). Add a manual override switch in the user dropdown (not just settings).
- **The `.glow-*` utilities** in `globals.css` were tuned for dark mode — the orbs are visible there but invisible on light. Either tune for both or scope them to `.dark` only.

---

## 9. Realtime Visual Language

WebSockets land in Phase 5. The design must accommodate live-updating values **gracefully** so it doesn't feel jumpy:

- **No spinners** for live updates. Spinners imply "something is loading"; realtime updates are steady-state.
- **No flash-and-fade** on every update — that fatigues the eye. Reserve fade-highlights for *meaningful* changes (status flip, new incident), not for routine `lastCheckedAt` updates.
- **Numeric values change without animation** (instant swap), but the cell briefly gets a 150ms `--background` tint shift to confirm the update happened.
- **Status dots** that change color use a 200ms cross-fade, not a hard cut.
- **New rows** (e.g. a new check appearing in the history table) slide in from top with 200ms ease-out.
- **Removed rows** fade out over 150ms before collapsing — never instant disappear.
- **Connection state indicator** in the user dropdown (small dot): green = connected, amber = reconnecting, red = disconnected. Don't put it in the main viewport.

The principle: realtime should feel like the dashboard is *alive*, not *flashing*.

---

## 10. Out of Scope (Don't Touch)

- **Status page themes** ([src/lib/status-themes.ts](../../src/lib/status-themes.ts)) — already polished. The redesign should harmonize with them but not replace them.
- **The 5 public status page themes** (midnight, aurora, clean, ember, terminal) — user-facing options, do not remove.
- **Email templates** — separate workstream, not this redesign.
- **Marketing site / landing page** — separate workstream.
- **The MCP tool surface itself** — the tool *list* is fixed by Diff #3. The Settings page that links to MCP docs *is* in scope; the tools are not.
- **Custom CSS field on status pages** — user feature, do not remove.

---

## 11. Custom Icon Mark Brief

**Parallel design track**, ~1 week. Runs alongside Phase 1.

### Constraints
- Keep the **BEACON wordmark** (uppercase, letterspaced, currently using Space Grotesk). The wordmark stays.
- Replace the **lucide `Activity` icon** with something distinctive.
- Must work at **16×16 favicon** (no fine detail).
- Must work **monochrome** (single fill, no gradient).
- Must work in **both light and dark contexts** (so probably a fill that works on both, or two color variants of the same shape).
- Suggests **"signal" or "pulse" or "watchtower"** — not literally a heartbeat (Activity is already that).

### Avoid
- Eye / camera / clock / chart / circle-with-dot — overused in monitoring tools
- Lighthouse — too literal to "beacon"
- Wifi-style waves — generic
- Any animal mascot — wrong tone

### Direction (suggested, not prescribed)
- A geometric mark that suggests "transmission" — concentric arcs, angular waves, or a radar-sweep abstraction
- Something that could later animate (the icon doing a "pulse" on a connection event would be a nice touch)
- Negative space that hints at a "B" without being a literal letterform

### Deliverables
- SVG (single source of truth)
- 16/24/32/48/64 pixel-perfect raster exports
- Monochrome and color variants
- A short rationale doc (2-3 sentences) explaining the concept so future contributors don't redesign it on a whim

---

## 12. Per-Page Notes

Brief for each Page ID. The designer should produce both desktop and mobile frames for every one.

### `P-AUTH`
- Centered card, current layout is fine. Tighten spacing per density spec.
- Replace `Activity` icon with new mark.
- The `.glow-orbs` background can stay here — auth is a "marketing surface" within the app.
- Mobile: full-bleed card with side padding.

### `P-DASH`
- Hero section: **incidents first** (if any are active), monitors stat-row second, monitor list third.
- Active incident banner at top — only renders when there's an unresolved incident. Subtle, persistent, links to incident detail.
- Stats row: **4 metrics** — uptime % (24h), incidents (24h), avg response time, monitors total. Each is a `text-display` number with a sparkline below. Tabular numerals.
- Monitor list: dense rows (36px), one per monitor. Status dot, name, target, last check timestamp, mini-sparkline (7-day uptime), response time. Sortable by clicking column headers. No card per monitor — this is a table.
- Empty state: "Add your first monitor" — single CTA, no decoration.

### `P-MON-LIST`
- Same dense table treatment as dashboard's monitor list. Filter chips at top (status, type). Sort. Multi-select for bulk actions (pause/resume/delete).
- "New monitor" button top-right.

### `P-MON-DETAIL`
- Header: breadcrumb, monitor name (editable), status pill, type badge, actions menu, pause/resume button.
- Stats row: **6 metrics** — current status, 24h uptime %, p50, p95, p99, last check timestamp.
- Response chart: full-width, 320px tall. Two series option (response time + status). Status-band overlay during incidents (semi-transparent `--status-down` band over the affected time range).
- Check history table below chart. Each row: timestamp, status (token color), response time (tabular), status code, error message (if any). Click row to expand details.
- Right rail (desktop only): related incidents (last 5), notification channels routing to this monitor, monitor configuration summary.
- Mobile: rail stacks below.

### `P-INC-LIST`
- Filter: status (open/resolved), severity, time range. Default: open + last 30 days.
- Each row: severity glyph, title, affected monitor count, opened time, last update time, status pill.
- Click → P-INC-DETAIL.

### `P-INC-DETAIL` — Differentiator #1 lands here
- Two-column layout (desktop):
  - **Left (60%):** incident header (title, severity, state, affected monitors, opened/resolved timestamps), description, related monitor charts (small).
  - **Right (40%):** **conversation thread** — chronological feed of system events (status changes), update posts (manual updates that go to status page subscribers), and inline comments (internal-only). Reuse pattern: each entry has author avatar, timestamp, content, type pill ("status update" / "comment" / "system"). Compose box at bottom for new comment or update.
- Action bar above the thread: **Acknowledge** (when unacknowledged), **Add update** (composer expands), **Resolve** (when investigating/identified/monitoring). Acknowledge is a one-click default action — single keystroke when the page is focused.
- @mention autocomplete in the composer pulls from organization members.
- Mobile: stacked, thread comes after incident detail.

### `P-SP-LIST`
- Card grid stays. Each card: status page name, slug, public/private badge, monitor count, "View public page" link.
- Empty state: "Create your first status page" with three template thumbnails (Minimal / Branded / Multi-region).

### `P-SP-EDIT` — Differentiator #2 lands here
- Tabbed form: General / Monitors / **Theme** / Footer. (Same structure, redesigned.)
- Theme tab additions:
  - **"Extract from favicon"** input at the top — field for a favicon URL, button "Extract palette". Below: 5 swatches showing the extracted palette, with the dominant color auto-applied as brand. User can swap which swatch maps to brand / accent / surface.
  - Below that, the existing theme picker (5 themes) and brand color picker remain. The favicon extraction *populates* these inputs; doesn't replace them.
- Live preview rail on the right showing the public page render in real time as the user edits.

### `P-SETTINGS`
- Sections: **Profile**, **Notifications** (channels — moved from top-level), **API keys & MCP**, **Members** (Team plan only), **Billing** (SaaS only), **Plan limits**.
- API keys & MCP section:
  - List of API keys (existing UI from [api-key-section.tsx](../../src/components/dashboard/api-key-section.tsx))
  - Above the list: a small panel "Connect Beacon to AI agents" with 2-3 sentences explaining MCP, code snippet for `mcp-remote` config, link to [/docs/MCP.md](../../MCP.md).
  - This is the **only** place MCP is surfaced in the dashboard. Don't put MCP UI on monitor pages or incident pages — the agent uses the same API key.

### `P-PUBLIC`
- Light touch. Verify token rename in Phase 2 doesn't break the existing themes. The 5 themes remain user-facing options.
- Maybe: tighten the typography to match the dashboard's new scale, but the layouts and color systems stay.

---

## 13. Acceptance Criteria

A page redesign is "accepted" only when:

1. ✅ Both light and dark designed
2. ✅ Both desktop (≥1024px) and mobile (<768px) designed
3. ✅ All status / severity / state colors come from tokens (no hex literals in the design file)
4. ✅ Tabular numerals on all numeric stats
5. ✅ Density spec followed (row heights, card padding, etc.)
6. ✅ Empty state designed
7. ✅ Loading skeleton designed (where applicable)
8. ✅ Error state designed (where applicable)
9. ✅ Keyboard shortcuts overlaid in spec where relevant
10. ✅ Realtime updating elements identified with the visual language from §9

---

## 14. Process for Updating This Doc

This doc is the **source of truth for the redesign direction**. If a tradeoff comes up during execution and the brief is silent on it, **propose an addition to this doc in the same PR**. Don't make ad-hoc design decisions in implementation PRs.

If the direction itself shifts (e.g. we decide to add a 4th reference, or drop a differentiator), edit this doc *first*, then the implementation.
