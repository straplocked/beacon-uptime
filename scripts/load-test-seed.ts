import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

const TARGETS = [
  "https://example.com",
  "https://httpbin.org/status/200",
  "https://jsonplaceholder.typicode.com",
  "https://api.github.com",
  "https://www.google.com",
  "https://cloudflare.com",
  "https://aws.amazon.com",
  "https://azure.microsoft.com",
  "https://httpstat.us/200",
  "https://reqres.in/api/users",
];

const PLAN_CONFIGS = {
  free: { monitors: [2, 3], interval: 300 },
  pro: { monitors: [10, 25], interval: 60 },
  team: { monitors: [20, 100], interval: 30 },
} as const;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTarget(): string {
  return TARGETS[Math.floor(Math.random() * TARGETS.length)];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const totalOrgs = parseInt(process.env.LOAD_TEST_ORGS || "100", 10);
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  console.log(`[load-test-seed] Seeding ${totalOrgs} organizations...`);

  // Create a shared test user
  const encoder = new TextEncoder();
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode("loadtest123"),
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

  // Distribution: 60% free, 25% pro, 15% team
  const planDistribution: Array<"free" | "pro" | "team"> = [];
  for (let i = 0; i < totalOrgs; i++) {
    if (i < totalOrgs * 0.6) planDistribution.push("free");
    else if (i < totalOrgs * 0.85) planDistribution.push("pro");
    else planDistribution.push("team");
  }
  // Shuffle
  for (let i = planDistribution.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [planDistribution[i], planDistribution[j]] = [planDistribution[j], planDistribution[i]];
  }

  let totalMonitors = 0;

  for (let i = 0; i < totalOrgs; i++) {
    const plan = planDistribution[i];
    const config = PLAN_CONFIGS[plan];
    const monitorCount = randomBetween(config.monitors[0], config.monitors[1]);

    // Create user
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `loadtest-${i}@beacon.local`,
        passwordHash,
        name: `Load Test User ${i}`,
      })
      .returning();

    // Create org
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: `Load Test Org ${i}`,
        slug: `loadtest-${i}`,
        plan,
      })
      .returning();

    await db.insert(schema.organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    // Batch insert monitors
    const monitorValues = Array.from({ length: monitorCount }, (_, j) => ({
      organizationId: org.id,
      createdByUserId: user.id,
      name: `Monitor ${j + 1} (${plan})`,
      type: "http" as const,
      target: randomTarget(),
      intervalSeconds: config.interval,
      timeoutMs: 10000,
      expectedStatusCode: 200,
      method: "GET" as const,
      status: "pending" as const,
    }));

    await db.insert(schema.monitors).values(monitorValues);
    totalMonitors += monitorCount;

    if ((i + 1) % 10 === 0) {
      console.log(`[load-test-seed] Created ${i + 1}/${totalOrgs} orgs (${totalMonitors} monitors)`);
    }
  }

  console.log(`[load-test-seed] Done! ${totalOrgs} orgs, ${totalMonitors} monitors`);
  console.log(`[load-test-seed] Distribution: ${planDistribution.filter(p => p === "free").length} free, ${planDistribution.filter(p => p === "pro").length} pro, ${planDistribution.filter(p => p === "team").length} team`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[load-test-seed] Failed:", err);
  process.exit(1);
});
