/**
 * Seed data for README screenshots — NOT the same as scripts/seed.ts.
 *
 * Deliberately uses example.com/example.org/example.net/TEST-NET-1 targets
 * and a demo@example.com login instead of any real hostname, so screenshots
 * never leak real infrastructure. Meant to run against the throwaway
 * "beacon-shots" database only — see scripts/screenshots/README.md.
 *
 * Seeds one org with all 6 monitor types, a status page, ~24h of synthetic
 * check history (with a deliberate outage window on the "Public API"
 * monitor), and an incident whose timeline demonstrates the
 * status-update / internal-comment / system-event split.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "DemoScreenshot123!";

async function hashPassword(password: string) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!/localhost|127\.0\.0\.1|@db[:/]/.test(databaseUrl)) {
    console.error(
      "[seed-demo] Refusing to run: DATABASE_URL doesn't look like a local/throwaway database.\n" +
        "This script inserts a demo@example.com account with a known password — never point it at a real install."
    );
    process.exit(1);
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  console.log("[seed-demo] Seeding screenshot demo data...");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo User",
    })
    .onConflictDoNothing()
    .returning();

  if (!user) {
    console.log(
      "[seed-demo] demo@example.com already exists — this database has already been seeded. Skipping."
    );
    await client.end();
    return;
  }

  console.log(`[seed-demo] Created user: ${user.email} (${user.id})`);

  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Acme Demo",
      slug: "acme-demo",
      plan: "pro",
    })
    .returning();

  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId: user.id,
    role: "owner",
  });

  console.log(`[seed-demo] Created organization: ${org.name} (${org.id})`);

  // ─── Monitors: one of each of the 6 types ───────────────────────

  const [apiMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Public API",
      type: "http",
      target: "https://example.com/api/health",
      intervalSeconds: 60,
      timeoutMs: 10000,
      expectedStatusCode: 200,
      method: "GET",
      status: "down",
      lastCheckedAt: minutesAgo(2),
    })
    .returning();

  const [marketingMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Marketing Site",
      type: "http",
      target: "https://example.com",
      intervalSeconds: 60,
      timeoutMs: 10000,
      expectedStatusCode: 200,
      method: "GET",
      status: "up",
      lastCheckedAt: minutesAgo(1),
    })
    .returning();

  const [dbMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Postgres (demo)",
      type: "tcp",
      target: "example.com:5432",
      intervalSeconds: 60,
      timeoutMs: 5000,
      status: "up",
      lastCheckedAt: minutesAgo(1),
    })
    .returning();

  const [dnsMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Primary DNS",
      type: "dns",
      target: "example.org",
      intervalSeconds: 300,
      timeoutMs: 5000,
      status: "up",
      lastCheckedAt: minutesAgo(3),
    })
    .returning();

  const [sslMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "TLS Certificate",
      type: "ssl",
      target: "example.com",
      intervalSeconds: 3600,
      timeoutMs: 10000,
      status: "degraded",
      lastCheckedAt: minutesAgo(45),
    })
    .returning();

  const [pingMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      // TEST-NET-1 (RFC 5737) — reserved for documentation, not a real host.
      name: "Edge Node",
      type: "ping",
      target: "192.0.2.10",
      intervalSeconds: 60,
      timeoutMs: 5000,
      status: "up",
      lastCheckedAt: minutesAgo(1),
    })
    .returning();

  const [heartbeatMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Nightly Backup Job",
      type: "heartbeat",
      target: "(heartbeat)",
      heartbeatToken: "demo-" + crypto.randomUUID(),
      heartbeatIntervalSeconds: 86400,
      status: "up",
      lastHeartbeatAt: minutesAgo(180),
    })
    .returning();

  console.log("[seed-demo] Created 6 monitors (one per type)");

  // ─── Check history ──────────────────────────────────────────────
  // ~24h of synthetic data per monitor, 15-minute cadence, with a
  // deliberate outage window on the API monitor in the last hour.

  const POINTS = 96; // 24h at 15-min spacing
  const rows: (typeof schema.checkResults.$inferInsert)[] = [];

  function seriesFor(
    monitorId: string,
    opts: { base: number; jitter: number; downFromMinute?: number }
  ) {
    for (let i = POINTS; i >= 0; i--) {
      const minute = i * 15;
      const time = minutesAgo(minute);
      const isDown =
        opts.downFromMinute !== undefined && minute <= opts.downFromMinute;
      rows.push({
        time,
        monitorId,
        region: "us-east",
        status: isDown ? "down" : "up",
        responseTimeMs: isDown
          ? null
          : Math.round(opts.base + (Math.random() - 0.5) * opts.jitter),
        statusCode: isDown ? null : 200,
        errorMessage: isDown ? "connect ECONNREFUSED" : null,
      });
    }
  }

  seriesFor(apiMonitor.id, { base: 180, jitter: 60, downFromMinute: 55 });
  seriesFor(marketingMonitor.id, { base: 90, jitter: 30 });
  seriesFor(dbMonitor.id, { base: 8, jitter: 4 });
  seriesFor(dnsMonitor.id, { base: 35, jitter: 15 });
  seriesFor(sslMonitor.id, { base: 210, jitter: 40 });
  seriesFor(pingMonitor.id, { base: 22, jitter: 10 });
  seriesFor(heartbeatMonitor.id, { base: 0, jitter: 0 });

  // Batch insert to keep this fast.
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(schema.checkResults).values(rows.slice(i, i + BATCH));
  }
  console.log(`[seed-demo] Inserted ${rows.length} check_results rows`);

  // ─── Status page ────────────────────────────────────────────────

  const [statusPage] = await db
    .insert(schema.statusPages)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Acme Status",
      slug: "acme-demo",
      brandColor: "#14b8a6",
      theme: "midnight",
      headerText: "Current status of Acme's public services",
      showUptimePercentage: true,
      showResponseTime: true,
      showHistoryDays: 90,
      isPublic: true,
    })
    .returning();

  await db.insert(schema.statusPageMonitors).values([
    {
      statusPageId: statusPage.id,
      monitorId: marketingMonitor.id,
      displayName: "Website",
      sortOrder: 0,
      groupName: "Core",
    },
    {
      statusPageId: statusPage.id,
      monitorId: apiMonitor.id,
      displayName: "Public API",
      sortOrder: 1,
      groupName: "Core",
    },
    {
      statusPageId: statusPage.id,
      monitorId: dnsMonitor.id,
      displayName: "DNS",
      sortOrder: 2,
      groupName: "Infrastructure",
    },
    {
      statusPageId: statusPage.id,
      monitorId: sslMonitor.id,
      displayName: "TLS Certificate",
      sortOrder: 3,
      groupName: "Infrastructure",
    },
  ]);

  console.log(`[seed-demo] Created status page: /s/${statusPage.slug}`);

  // ─── Incident: demonstrates ack + internal-vs-public comment split ──

  const [incident] = await db
    .insert(schema.incidents)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      statusPageId: statusPage.id,
      title: "Elevated errors on the Public API",
      status: "identified",
      impact: "major",
      acknowledgedAt: minutesAgo(40),
      acknowledgedByUserId: user.id,
      createdAt: minutesAgo(55),
    })
    .returning();

  await db.insert(schema.incidentUpdates).values([
    {
      incidentId: incident.id,
      status: "investigating",
      kind: "status",
      message:
        "We're seeing elevated error rates and timeouts on the Public API. Investigating.",
      authoredByUserId: user.id,
      createdAt: minutesAgo(55),
    },
    {
      incidentId: incident.id,
      status: "investigating",
      kind: "system",
      message: "Incident acknowledged by Demo User.",
      createdAt: minutesAgo(40),
    },
    {
      incidentId: incident.id,
      status: "investigating",
      kind: "comment",
      message:
        "Confirmed with infra — looks isolated to the read-replica connection pool, not a full outage. Holding off on a public update until we're sure. (internal-only, does not publish to subscribers)",
      authoredByUserId: user.id,
      createdAt: minutesAgo(30),
    },
    {
      incidentId: incident.id,
      status: "identified",
      kind: "status",
      message:
        "Root cause identified: connection pool exhaustion on the read replica. Deploying a fix now.",
      authoredByUserId: user.id,
      createdAt: minutesAgo(10),
    },
  ]);

  console.log(
    `[seed-demo] Created incident with 4 timeline entries (status/system/comment/status)`
  );

  // ─── Notification channels (for the Settings screenshot) ───────

  await db.insert(schema.notificationChannels).values([
    {
      organizationId: org.id,
      createdByUserId: user.id,
      type: "email",
      name: "Team Email",
      config: { email: "demo@example.com" },
      isDefault: true,
    },
    {
      organizationId: org.id,
      createdByUserId: user.id,
      type: "slack",
      name: "#incidents (demo)",
      config: { webhookUrl: "https://hooks.example.com/services/DEMO/DEMO/demo" },
      isDefault: false,
    },
  ]);

  console.log("[seed-demo] Created 2 notification channels");
  console.log(`[seed-demo] Done. Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-demo] Seeding failed:", err);
  process.exit(1);
});
