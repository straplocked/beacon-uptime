#!/usr/bin/env node
// Captures README screenshots for Beacon Uptime, in both light and dark
// mode, against a local instance seeded by scripts/screenshots/seed-demo.ts.
//
// Run inside the Playwright container so the host never needs browsers
// installed — see scripts/screenshots/README.md for the exact commands.
//
// Env vars:
//   BASE_URL     e.g. http://localhost:3187 (default)
//   OUT_DIR      output root (default: docs/assets/screenshots)
//   DEMO_EMAIL   default: demo@example.com
//   DEMO_PASSWORD default: DemoScreenshot123!  (matches seed-demo.ts)

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3187";
const OUT_DIR = process.env.OUT_DIR || "docs/assets/screenshots";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@example.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "DemoScreenshot123!";

const VIEWPORT = { width: 1440, height: 900 };

async function shot(page, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath });
  console.log(`  wrote ${outPath}`);
}

async function loginAndGetIds(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", DEMO_EMAIL);
  await page.fill("#password", DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL(`${BASE_URL}/`, { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(500);

  // Pull real ids for the monitor-detail / incident-detail / status-page
  // shots by hitting the internal dashboard APIs the page itself uses.
  const monitors = await page
    .evaluate(async () => {
      const res = await fetch("/api/internal/monitors", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.monitors ?? [];
    })
    .catch(() => []);

  const incidents = await page
    .evaluate(async () => {
      const res = await fetch("/api/internal/incidents", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.incidents ?? [];
    })
    .catch(() => []);

  const statusPages = await page
    .evaluate(async () => {
      const res = await fetch("/api/internal/status-pages", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.statusPages ?? [];
    })
    .catch(() => []);

  return { monitors, incidents, statusPages };
}

async function captureTheme(browser, theme) {
  console.log(`\n=== ${theme} ===`);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: theme, // matches prefers-color-scheme: dark/light
  });

  // The app's own toggle stores an explicit override in localStorage
  // ("beacon-theme"), read before first paint in src/app/layout.tsx's
  // inline script, and re-applied by the dashboard shell on mount. Setting
  // it up front means we don't depend on prefers-color-scheme alone (which
  // only wins when there's no stored override) or on clicking the toggle.
  await context.addInitScript((t) => {
    try {
      window.localStorage.setItem("beacon-theme", t);
    } catch {
      /* ignore */
    }
  }, theme);

  const page = await context.newPage();
  const outDir = path.join(OUT_DIR, theme);

  const { monitors, incidents, statusPages } = await loginAndGetIds(page);
  console.log(
    `  found ${monitors.length} monitors, ${incidents.length} incidents, ${statusPages.length} status pages`
  );

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await shot(page, path.join(outDir, "dashboard.png"));

  await page.goto(`${BASE_URL}/monitors`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await shot(page, path.join(outDir, "monitors.png"));

  const monitorId =
    monitors.find((m) => m.name === "Public API")?.id ?? monitors[0]?.id;
  if (monitorId) {
    await page.goto(`${BASE_URL}/monitors/${monitorId}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(300);
    await shot(page, path.join(outDir, "monitor-detail.png"));
  } else {
    console.warn("  no monitors found, skipping monitor-detail.png");
  }

  // /api/internal/incidents nests the row under `.incident` alongside the
  // joined status page name/slug — see src/app/api/internal/incidents/route.ts.
  const incidentId = incidents[0]?.incident?.id;
  if (incidentId) {
    await page.goto(`${BASE_URL}/incidents/${incidentId}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(300);
    await shot(page, path.join(outDir, "incident-detail.png"));
  } else {
    console.warn("  no incidents found, skipping incident-detail.png");
  }

  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await shot(page, path.join(outDir, "settings.png"));

  // Public status page: unauthenticated, own tab so the dashboard session
  // cookie is irrelevant. Its visual theme ("midnight" etc, see
  // src/lib/status-themes.ts) is independent of the app's light/dark
  // toggle, but we still capture it under both color-scheme emulations for
  // a matched light/dark screenshot set.
  const slug = statusPages[0]?.slug;
  if (slug) {
    const publicPage = await context.newPage();
    await publicPage.goto(`${BASE_URL}/s/${slug}`, {
      waitUntil: "networkidle",
    });
    await publicPage.waitForTimeout(300);
    await shot(publicPage, path.join(outDir, "status-page.png"));
    await publicPage.close();
  } else {
    console.warn("  no status pages found, skipping status-page.png");
  }

  await context.close();
}

async function main() {
  console.log(`Capturing screenshots from ${BASE_URL} into ${OUT_DIR}`);
  const browser = await chromium.launch();
  try {
    await captureTheme(browser, "light");
    await captureTheme(browser, "dark");
  } finally {
    await browser.close();
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
