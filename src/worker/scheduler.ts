import IORedis from "ioredis";
import { Queue } from "bullmq";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { eq, and, lte, or, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── Setup ──────────────────────────────────────────────────────

const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
const databaseUrl = process.env.DATABASE_URL!;

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queryClient = postgres(databaseUrl);
const db = drizzle(queryClient, { schema });

const monitorCheckQueue = new Queue("monitor-checks", {
  connection: redis as any,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
});

const SCHEDULER_INTERVAL_MS = 15_000; // Run every 15 seconds

console.log("[scheduler] Starting monitor scheduler");

// ─── Scheduling Logic ───────────────────────────────────────────

async function scheduleChecks() {
  try {
    const now = new Date();

    // Find all active monitors that are due for a check
    const dueMonitors = await db
      .select()
      .from(schema.monitors)
      .where(
        and(
          eq(schema.monitors.isPaused, false),
          or(
            // Never been checked
            isNull(schema.monitors.lastCheckedAt),
            // Due for a check: last_checked_at + interval_seconds <= now
            lte(
              sql`${schema.monitors.lastCheckedAt} + (${schema.monitors.intervalSeconds} * interval '1 second')`,
              sql`${now.toISOString()}::timestamptz`
            )
          )
        )
      );

    if (dueMonitors.length === 0) return;

    console.log(`[scheduler] ${dueMonitors.length} monitor(s) due for checks`);

    for (const monitor of dueMonitors) {
      // Use monitor ID as job ID to prevent duplicates
      const jobId = `check-${monitor.id}`;

      await monitorCheckQueue.add(
        jobId,
        { monitorId: monitor.id },
        {
          jobId,
          // Prevent duplicate jobs for the same monitor
          deduplication: { id: jobId },
        }
      );
    }
  } catch (error) {
    console.error("[scheduler] Error scheduling checks:", error);
  }
}

// ─── Heartbeat Monitor ─────────────────────────────────────────

async function checkHeartbeats() {
  try {
    // Find heartbeat monitors where last_heartbeat_at + interval has passed
    const overdueHeartbeats = await db
      .select()
      .from(schema.monitors)
      .where(
        and(
          eq(schema.monitors.type, "heartbeat"),
          eq(schema.monitors.isPaused, false),
          sql`${schema.monitors.lastHeartbeatAt} IS NOT NULL`,
          lte(
            sql`${schema.monitors.lastHeartbeatAt} + (${schema.monitors.heartbeatIntervalSeconds} * interval '1 second')`,
            sql`now()`
          ),
          // Only flag if currently up (avoid repeated alerts)
          eq(schema.monitors.status, "up")
        )
      );

    for (const monitor of overdueHeartbeats) {
      console.log(
        `[scheduler] Heartbeat monitor "${monitor.name}" is overdue, marking as down`
      );

      // Import evaluator to process the "down" result
      const { processCheckResult } = await import("../lib/monitoring/evaluator");
      await processCheckResult(
        {
          id: monitor.id,
          userId: monitor.userId,
          name: monitor.name,
          target: monitor.target,
          type: monitor.type,
          status: monitor.status,
        },
        {
          monitorId: monitor.id,
          region: "heartbeat",
          status: "down",
          responseTimeMs: null,
          statusCode: null,
          errorMessage: `No heartbeat received within ${monitor.heartbeatIntervalSeconds}s interval`,
          tlsExpiry: null,
        }
      );
    }
  } catch (error) {
    console.error("[scheduler] Error checking heartbeats:", error);
  }
}

// ─── Data Retention Cleanup ──────────────────────────────────

const PLAN_RETENTION_DAYS: Record<string, number> = {
  free: 7,
  pro: 30,
  team: 90,
};

async function cleanupOldData() {
  try {
    // Get all users with their plan
    const allUsers = await db
      .select({ id: schema.users.id, plan: schema.users.plan })
      .from(schema.users);

    let totalDeleted = 0;

    for (const user of allUsers) {
      const retentionDays = PLAN_RETENTION_DAYS[user.plan] || 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      // Delete old check results for this user's monitors
      const result = await db.execute(sql`
        DELETE FROM check_results
        WHERE monitor_id IN (
          SELECT id FROM monitors WHERE user_id = ${user.id}
        )
        AND time < ${cutoff.toISOString()}::timestamptz
      `);

      const deleted = (result as any)?.rowCount || 0;
      if (deleted > 0) totalDeleted += deleted;
    }

    if (totalDeleted > 0) {
      console.log(`[scheduler] Data retention cleanup: deleted ${totalDeleted} old check results`);
    }
  } catch (error) {
    console.error("[scheduler] Error during data retention cleanup:", error);
  }
}

// ─── Main Loop ──────────────────────────────────────────────────

const CLEANUP_EVERY_N_TICKS = 240; // ~1 hour at 15s intervals

async function run() {
  console.log(
    `[scheduler] Scheduling loop started (interval: ${SCHEDULER_INTERVAL_MS}ms)`
  );

  let tickCount = 0;

  // Initial run
  await scheduleChecks();
  await checkHeartbeats();

  // Continuous loop
  setInterval(async () => {
    tickCount++;
    await scheduleChecks();
    await checkHeartbeats();

    if (tickCount % CLEANUP_EVERY_N_TICKS === 0) {
      await cleanupOldData();
    }
  }, SCHEDULER_INTERVAL_MS);
}

// ─── Graceful Shutdown ──────────────────────────────────────────

async function shutdown() {
  console.log("[scheduler] Shutting down...");
  await monitorCheckQueue.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

run().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
