// Mobile (390x844) screenshots for the PWA work item: dashboard, incident
// detail, and the offline page, in both light and dark. Run against `next
// dev` (not the production build) because the production Docker/next-start
// server marks the session cookie Secure, which breaks login over plain
// http://localhost — see scripts/screenshots/README.md.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3460";
const OUT_DIR = process.env.OUT_DIR || "docs/assets/screenshots/mobile";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@example.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "DemoScreenshot123!";
const VIEWPORT = { width: 390, height: 844 };

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

  const incidents = await page
    .evaluate(async () => {
      const res = await fetch("/api/internal/incidents", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.incidents ?? [];
    })
    .catch(() => []);

  return { incidents };
}

async function captureTheme(browser, theme) {
  console.log(`\n=== ${theme} ===`);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: theme,
  });

  // See scripts/screenshots/capture.mjs — the app's toggle stores an
  // explicit override in localStorage, read before first paint. Setting it
  // up front avoids a race in the dashboard shell's mount-time effect
  // where the "dark" initial state can win over prefers-color-scheme.
  await context.addInitScript((t) => {
    try {
      window.localStorage.setItem("beacon-theme", t);
    } catch {
      /* ignore */
    }
  }, theme);

  const page = await context.newPage();

  const { incidents } = await loginAndGetIds(page);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, path.join(OUT_DIR, theme, "dashboard.png"));

  // /api/internal/incidents nests the row under `.incident` alongside the
  // joined status page name/slug (see scripts/screenshots/capture.mjs).
  const incidentId = incidents[0]?.incident?.id;
  if (incidentId) {
    await page.goto(`${BASE_URL}/incidents/${incidentId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await shot(page, path.join(OUT_DIR, theme, "incident-detail.png"));
  } else {
    console.log("  no incidents found, skipping incident-detail.png");
  }

  // Offline page — served statically, doesn't need auth. Force the OS-level
  // color scheme via a fresh context page reload so it picks up dark/light
  // tokens the same way.
  await page.goto(`${BASE_URL}/offline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  await shot(page, path.join(OUT_DIR, theme, "offline.png"));

  await context.close();
}

async function main() {
  const browser = await chromium.launch();
  await captureTheme(browser, "light");
  await captureTheme(browser, "dark");
  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
