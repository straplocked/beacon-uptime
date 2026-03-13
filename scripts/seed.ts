import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  console.log("[seed] Seeding database...");

  // Hash password for demo user (simple hash for seeding)
  const encoder = new TextEncoder();
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode("password123"),
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
  const passwordHash = `${saltHex}:${hashHex}`;

  // Create demo user
  const [user] = await db
    .insert(schema.users)
    .values({
      email: "demo@beacon.local",
      passwordHash,
      name: "Demo User",
    })
    .onConflictDoNothing()
    .returning();

  if (!user) {
    console.log("[seed] Demo user already exists, skipping...");
    await client.end();
    return;
  }

  console.log(`[seed] Created user: ${user.email} (${user.id})`);

  // Create personal organization
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Demo Organization",
      slug: "demo-at-beacon-local",
      plan: "pro",
    })
    .returning();

  console.log(`[seed] Created organization: ${org.name} (${org.id})`);

  // Create owner membership
  await db.insert(schema.organizationMembers).values({
    organizationId: org.id,
    userId: user.id,
    role: "owner",
  });

  // Create monitors
  const [httpMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Beacon Homepage",
      type: "http",
      target: "https://beacon.pluginsynthesis.com",
      intervalSeconds: 60,
      timeoutMs: 10000,
      expectedStatusCode: 200,
      method: "GET",
      status: "pending",
    })
    .returning();

  const [apiMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Google DNS",
      type: "dns",
      target: "google.com",
      intervalSeconds: 300,
      timeoutMs: 5000,
      status: "pending",
    })
    .returning();

  const [sslMonitor] = await db
    .insert(schema.monitors)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "GitHub SSL",
      type: "ssl",
      target: "github.com",
      intervalSeconds: 3600,
      timeoutMs: 10000,
      status: "pending",
    })
    .returning();

  console.log(`[seed] Created ${3} monitors`);

  // Create status page
  const [statusPage] = await db
    .insert(schema.statusPages)
    .values({
      organizationId: org.id,
      createdByUserId: user.id,
      name: "Beacon Status",
      slug: "beacon",
      brandColor: "#10b981",
      headerText: "All systems operational",
      showUptimePercentage: true,
      showResponseTime: true,
      showHistoryDays: 90,
    })
    .returning();

  console.log(`[seed] Created status page: ${statusPage.slug}`);

  // Link monitors to status page
  await db.insert(schema.statusPageMonitors).values([
    {
      statusPageId: statusPage.id,
      monitorId: httpMonitor.id,
      displayName: "Website",
      sortOrder: 0,
      groupName: "Core",
    },
    {
      statusPageId: statusPage.id,
      monitorId: apiMonitor.id,
      displayName: "DNS Resolution",
      sortOrder: 1,
      groupName: "Infrastructure",
    },
    {
      statusPageId: statusPage.id,
      monitorId: sslMonitor.id,
      displayName: "SSL Certificate",
      sortOrder: 2,
      groupName: "Security",
    },
  ]);

  // Create a default email notification channel
  await db.insert(schema.notificationChannels).values({
    organizationId: org.id,
    createdByUserId: user.id,
    type: "email",
    name: "Primary Email",
    config: { email: "demo@beacon.local" },
    isDefault: true,
  });

  console.log("[seed] Created notification channel");
  console.log("[seed] Seeding complete!");

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Seeding failed:", err);
  process.exit(1);
});
