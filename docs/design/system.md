# Beacon Uptime — Current Design System (Phase 0 Audit)

> **Status:** baseline as of the start of the 2026-Q2 UI overhaul. This document captures *what's there* so the redesign brief can react to it.
> **Companion docs:** [handoff-2026-q2.md](handoff-2026-q2.md) (the design direction we're moving toward), [../../ROADMAP.md](../../ROADMAP.md) (sprint sequencing).

## TL;DR

Beacon's current dashboard is a thin layer of shadcn/ui defaults on top of a moderately well-thought-out OKLch color system. The strongest existing surface is the **public status page** (`/s/[slug]`), which has 5 themes, custom CSS support, and a real CSS-variable theming abstraction. The weakest surface is the **internal dashboard**, which uses generic shadcn cards with status colors hardcoded as Tailwind classes (`bg-teal-500`, `bg-red-500`) scattered across components. There is no semantic token layer for status or severity, so a status-color change today requires a grep-and-replace across multiple files.

The design system is best described as: ✅ *foundation present*, ❌ *no semantic layer*, ❌ *no documented patterns*, ❌ *no spacing/typography scale*, ⚠️ *brand identity is a placeholder lucide icon*.

---

## Surfaces

| Surface | Polish | Notes |
|---|---|---|
| Public status page (`/s/[slug]`) | Strong | 5 themes via `--sp-*` CSS vars, custom CSS field, real theming abstraction in [src/lib/status-themes.ts](../../src/lib/status-themes.ts). **Do not regress this.** |
| Auth pages (`/login`, `/register`) | Medium | Centered card, gradient bg with `.glow-orbs`, generic but inoffensive. |
| Dashboard pages (everything under `(dashboard)/`) | Weak | Plain shadcn cards. Hardcoded status colors. No spacing rhythm. No empty-state polish beyond "icon + text". |

---

## Tokens

Defined in [src/app/globals.css](../../src/app/globals.css) via Tailwind v4's `@theme inline` block.

### Color (OKLch, light mode)

```
--background        oklch(0.99 0.002 220)   near-white, faint blue tint
--foreground        oklch(0.15 0.015 260)   near-black, blue tint
--primary           oklch(0.55 0.15 195)    teal-cyan (brand)
--primary-foreground oklch(0.99 0 0)
--card              oklch(1 0 0)            pure white
--secondary/muted/accent  oklch(0.96 0.005 220)  light gray (collapsed into one tone)
--destructive       oklch(0.577 0.245 27.325)
--border / --input  oklch(0.91 0.005 220)
--ring              oklch(0.55 0.15 195)    same as primary
--chart-1..5        teal/blue/violet/purple/green ramp
--sidebar-*         echo of base palette
```

### Color (OKLch, dark mode `.dark`)

```
--background        oklch(0.16 0.02 260)    deep blue-gray
--foreground        oklch(0.95 0.005 220)
--primary           oklch(0.72 0.15 195)    brighter teal for contrast
--card              oklch(0.20 0.02 255)
--border            oklch(1 0 0 / 10%)      transparency-based
```

**Strengths:** OKLch is perceptually uniform and modern. Light/dark covered. Sidebar gets dedicated tokens.
**Gaps:** No semantic status tokens. `--secondary`, `--muted`, `--accent` are all the same value (functional collapse, not intentional). No tertiary accent.

### Typography

| Role | Font | Loaded in |
|---|---|---|
| Sans (body) | Inter | [src/app/layout.tsx](../../src/app/layout.tsx) |
| Mono (code/logs) | JetBrains Mono | layout.tsx |
| Display (headings) | Space Grotesk (600/700) | layout.tsx |

No defined type scale — components use ad-hoc `text-sm` / `text-base` / `text-2xl` / `font-bold` / `font-extrabold`. Heading hierarchy is inconsistent (some pages use `<h1>` with `text-2xl font-bold`, others use `<div className="text-2xl">`).

### Radius

```
--radius     0.625rem      (10px base)
--radius-sm  60% of base
--radius-md  80%
--radius-lg  100%
--radius-xl  140%
--radius-2xl 180%
--radius-3xl 220%
--radius-4xl 260%
```

A real proportional scale, but it's defined and largely unused — most components stick with `rounded-md`.

### Spacing

**No project-defined scale.** Components use Tailwind defaults (4px base). Common patterns observed:
- Card padding: `p-6` (24px) — shadcn default
- Page padding: `p-6 lg:p-8` (24px → 32px)
- Stack gaps: `space-y-4` / `space-y-8`
- Form gaps: `space-y-4` / `gap-2` for label+input

This is not a design system; it's a default. Phase 1 specifies a Linear-tight scale to replace it.

### Shadows / Depth

Only ad-hoc utilities in `globals.css`:
- `.glow-card` — gradient ring on hover (used inconsistently)
- `.glow-btn` — primary-colored glow on hover
- `.glow-surface` — subtle inset/shadow combo
- `.glow-orbs` — fixed-position background blobs (used on auth pages)

No defined elevation scale. No `--shadow-sm/md/lg` tokens.

---

## Component Inventory

### Primitives ([src/components/ui/](../../src/components/ui/))

13 files, all shadcn/ui-pattern:

| Component | Source | Notes |
|---|---|---|
| [button.tsx](../../src/components/ui/button.tsx) | shadcn + `@base-ui/react` Button | Variants: default, outline, secondary, ghost, destructive, link. Sizes: xs, sm, default, lg, icon variants. |
| [card.tsx](../../src/components/ui/card.tsx) | shadcn | Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter. Has size prop. References `.glow-surface`. |
| [input.tsx](../../src/components/ui/input.tsx) | shadcn | Basic. Error states minimal. |
| [label.tsx](../../src/components/ui/label.tsx) | shadcn | |
| [textarea.tsx](../../src/components/ui/textarea.tsx) | shadcn | |
| [select.tsx](../../src/components/ui/select.tsx) | shadcn (with `@base-ui/react` under the hood) | `onValueChange` receives `string \| null` — see project memory. |
| [badge.tsx](../../src/components/ui/badge.tsx) | shadcn | Variants only — no `severity` or `incident-state` variants yet (Phase 2). |
| [dialog.tsx](../../src/components/ui/dialog.tsx) | `@base-ui/react` | Focus management not configured. |
| [dropdown-menu.tsx](../../src/components/ui/dropdown-menu.tsx) | shadcn | |
| [sheet.tsx](../../src/components/ui/sheet.tsx) | shadcn | Side drawer. |
| [switch.tsx](../../src/components/ui/switch.tsx) | shadcn | |
| [tabs.tsx](../../src/components/ui/tabs.tsx) | shadcn | |
| [table.tsx](../../src/components/ui/table.tsx) | shadcn | Plain HTML wrapper. |
| [avatar.tsx](../../src/components/ui/avatar.tsx) | shadcn | |
| [tooltip.tsx](../../src/components/ui/tooltip.tsx) | shadcn (TooltipProvider in layout root) | |

### Missing primitives (will add in Phase 2)

- `Skeleton` — for loading states
- `Toast` (sonner) — currently no toast pattern
- `Breadcrumb` — currently no breadcrumb component
- `CommandPalette` (cmdk) — for Cmd-K
- `Pagination` — used nowhere currently
- `Alert` — for inline alerts beyond destructive Cards

### Feature components

**Dashboard ([src/components/dashboard/](../../src/components/dashboard/))** — 6 files
- [dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) — sidebar layout, org switcher, user section. Hardcoded `planColors` map (lines 78-82).
- [status-page-form.tsx](../../src/components/dashboard/status-page-form.tsx) — 400+ line form with tabs (General/Monitors/Theme/Footer). The most complex form.
- [incident-update-form.tsx](../../src/components/dashboard/incident-update-form.tsx) — timeline update composer. Reuse target for incident comments.
- [add-channel-form.tsx](../../src/components/dashboard/add-channel-form.tsx) — notification channel form.
- [billing-section.tsx](../../src/components/dashboard/billing-section.tsx) — plan info card.
- [api-key-section.tsx](../../src/components/dashboard/api-key-section.tsx) — API key UI. Will gain MCP-aware copy in Diff #3.

**Monitors ([src/components/monitors/](../../src/components/monitors/))** — 4 files
- [response-chart.tsx](../../src/components/monitors/response-chart.tsx) — Recharts AreaChart. **Hardcodes `#14b8a6` for stroke** — token violation.
- [check-history.tsx](../../src/components/monitors/check-history.tsx) — scrollable check table. **Inline reds** — token violation.
- [editable-name.tsx](../../src/components/monitors/editable-name.tsx) — inline name editing.
- [monitor-actions.tsx](../../src/components/monitors/monitor-actions.tsx) — pause/resume/delete dropdown.

**Status page ([src/components/status-page/](../../src/components/status-page/))** — 7 files. **Polished surface — minimal touch in overhaul.**
- [component-row.tsx](../../src/components/status-page/component-row.tsx)
- [chart-row.tsx](../../src/components/status-page/chart-row.tsx)
- [compact-row.tsx](../../src/components/status-page/compact-row.tsx)
- [uptime-bar.tsx](../../src/components/status-page/uptime-bar.tsx) — 90-day GitHub-contribution-style bar chart, all colors via `--sp-*` vars. Good pattern.
- [incident-card.tsx](../../src/components/status-page/incident-card.tsx)
- [subscribe-button.tsx](../../src/components/status-page/subscribe-button.tsx)
- [footer.tsx](../../src/components/status-page/footer.tsx)

---

## Patterns Observed

### What works
- **Status page theme abstraction.** [src/lib/status-themes.ts](../../src/lib/status-themes.ts) defines 5 themes (midnight, aurora, clean, ember, terminal), each as a record of CSS custom properties (`--sp-bg`, `--sp-accent`, `--sp-bar-up`, etc.). This is a real design system in miniature. The dashboard should learn from this pattern.
- **OKLch tokens.** Modern, perceptually uniform, light/dark-aware.
- **Sidebar IA.** [dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) is clean. Active state, org switcher, mobile overlay all work.

### What doesn't
- **Dark mode is inconsistent across pages.** The dashboard renders fully dark; the monitor detail page renders with a dark sidebar but a **light main content area** (Cards default to white surface, grids appear light). See `screenshots/baseline/desktop/04-dashboard.png` vs `07-monitor-detail.png`. The `.dark` class is being applied at one level but not consistently consumed by every Card / chart container. Phase 2 token migration must verify `--card` resolves correctly under `.dark` on every page, not just the dashboard.
- **Hardcoded status colors.** Spread across multiple files, no single source of truth:
  - [src/app/(dashboard)/dashboard/page.tsx](../../src/app/(dashboard)/dashboard/page.tsx) lines 42-50 — `bg-teal-500 / bg-red-500 / bg-amber-500 / bg-slate-400` for status dots
  - [src/components/monitors/response-chart.tsx](../../src/components/monitors/response-chart.tsx) — `stroke="#14b8a6"` literal
  - [src/components/monitors/check-history.tsx](../../src/components/monitors/check-history.tsx) — inline red text for errors
  - [src/components/dashboard/dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) lines 78-82 — `planColors` map with `bg-slate-100 text-slate-600 dark:bg-slate-800 ...` etc.
- **Generic logo.** lucide-react `Activity` icon used as the brand mark. Identical to many other apps.
- **No empty-state polish.** Pages mostly show "icon + sentence" — functional, joyless.
- **No loading skeletons.** Pages either render or don't.
- **No focus management.** Dialogs from `@base-ui/react` don't trap focus by default.
- **Mixed heading hierarchy.** Some pages start with `<h1>`, others with styled `<div>`. No consistent landmark structure.
- **No keyboard shortcuts.** No Cmd-K, no `j/k` navigation, no `?` for help.
- **Inconsistent date/time rendering.** Some places use `toLocaleString`, some custom formatters, some raw ISO strings. `suppressHydrationWarning` is sprinkled around as a workaround.

### Auditable hard-coded color literals

```bash
# Run from repo root to see all violations:
grep -rEn "#[0-9a-fA-F]{6}|bg-(teal|red|amber|slate|emerald|blue|indigo)-[0-9]+" \
  src/components src/app | grep -v node_modules
```

This grep is the **acceptance test** for Phase 2's token migration. It should return near-zero results after Phase 2.

---

## Routes Inventory

17 routes total.

### Public / unauth
- `/` — redirect to `/login` or `/dashboard`
- `/login` — auth
- `/register` — auth
- `/s/[slug]` — public status page

### Dashboard (auth-gated, `(dashboard)` layout)
- `/dashboard` — overview stats + monitor list
- `/monitors` — monitor list
- `/monitors/new` — create monitor form
- `/monitors/[id]` — monitor detail
- `/incidents` — incident list
- `/incidents/new` — create incident form
- `/incidents/[id]` — incident detail (Diff #1 lands here)
- `/notifications` — notification channels
- `/status-pages` — status page list
- `/status-pages/new` — create status page (Diff #2 lands here)
- `/status-pages/[id]/edit` — edit status page (Diff #2 also)
- `/settings` — account & org (Diff #3 surfaces here as docs link)
- `/settings/members` — team management

### Page IDs (for the handoff brief)
| ID | Routes |
|---|---|
| `P-AUTH` | `/login`, `/register` |
| `P-DASH` | `/dashboard` |
| `P-MON-LIST` | `/monitors`, `/monitors/new` |
| `P-MON-DETAIL` | `/monitors/[id]` |
| `P-INC-LIST` | `/incidents`, `/incidents/new` |
| `P-INC-DETAIL` | `/incidents/[id]` |
| `P-SP-LIST` | `/status-pages` |
| `P-SP-EDIT` | `/status-pages/new`, `/status-pages/[id]/edit` |
| `P-SETTINGS` | `/settings`, `/settings/members`, `/notifications` (post-IA-shift) |
| `P-PUBLIC` | `/s/[slug]` |

---

## What to Preserve

These are the things the redesign explicitly **must not regress**:

1. **Status-page theming abstraction** in [src/lib/status-themes.ts](../../src/lib/status-themes.ts). The new dashboard token system can coexist with this — they're different prefixes (`--*` for dashboard, `--sp-*` for status pages). Don't merge them.
2. **OKLch color space.** Stay in OKLch. Don't switch to HSL or RGB.
3. **Server-rendered status pages.** [src/app/s/[slug]/page.tsx](../../src/app/s/[slug]/page.tsx) is SSR + edge-friendly. Don't move it client-side.
4. **Custom CSS field on status pages.** Pro/Team users rely on this for white-labeling. The token rename in Phase 2 can't break their existing CSS.
5. **The 5 status-page themes** (midnight, aurora, clean, ember, terminal). These are user-facing options.
6. **Tailwind v4.** Stay on v4. Don't add a separate styling solution.
7. **shadcn/ui as the primitive layer.** Augment, don't replace.

---

## Accessibility Baseline

Estimated WCAG 2.1 levels (visual review, not measured):
- **Level A:** ~60% — basic structure, form labels mostly correct
- **Level AA:** ~30% — failing on keyboard navigation, focus management, heading hierarchy, aria attributes
- **Level AAA:** <10%

Specific gaps:
- Dialogs do not trap focus
- No skip-to-content link
- Status dots are not labeled for screen readers (`<span className="bg-teal-500" />`)
- No `aria-live` regions for status changes
- Color contrast not verified for `text-muted-foreground` on `--muted`
- Touch targets — some buttons are 24-28px; should be 44px minimum

Phase 6 fixes all of this. Don't try to fix it incrementally during page rebuilds — batch it.

---

## Process for Updating This Doc

This file is the **Phase 0 baseline**. After Phase 2 (tokens & primitives) lands, update the "Tokens" section to reflect the new contract. After Phase 6, update the "Accessibility Baseline" section with measured numbers.

For changes to the design *direction* (not the audit), update [handoff-2026-q2.md](handoff-2026-q2.md) instead.
