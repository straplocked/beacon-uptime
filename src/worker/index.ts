import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { performHttpCheck } from "../lib/monitoring/checks/http";
import { performTcpCheck } from "../lib/monitoring/checks/tcp";
import { performDnsCheck } from "../lib/monitoring/checks/dns";
import { performSslCheck } from "../lib/monitoring/checks/ssl";
import { performPingCheck } from "../lib/monitoring/checks/ping";
import { sendEmailNotification } from "../lib/notifications/email";
import { sendSlackNotification } from "../lib/notifications/slack";
import { sendDiscordNotification } from "../lib/notifications/discord";
import { sendWebhookNotification } from "../lib/notifications/webhook";
import { sendIncidentNotificationEmail } from "../lib/notifications/subscriber-email";

// ─── Setup ──────────────────────────────────────────────────────

const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
const databaseUrl = process.env.DATABASE_URL!;

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queryClient = postgres(databaseUrl);
const db = drizzle(queryClient, { schema });

const region = process.env.PROBE_REGION || "us-east";

console.log(`[worker] Starting monitor check worker (region: ${region})`);

// ─── Monitor Check Worker ───────────────────────────────────────

const checkWorker = new Worker(
  "monitor-checks",
  async (job: Job) => {
    const { monitorId } = job.data;

    // Fetch fresh monitor data
    const monitor = await db
      .select()
      .from(schema.monitors)
      .where(eq(schema.monitors.id, monitorId))
      .limit(1);

    if (monitor.length === 0) {
      console.warn(`[worker] Monitor ${monitorId} not found, skipping`);
      return;
    }

    const mon = monitor[0];

    if (mon.isPaused) {
      return; // Skip paused monitors
    }

    console.log(`[worker] Checking ${mon.type}://${mon.target} (${mon.name})`);

    let result: {
      status: "up" | "down" | "degraded";
      responseTimeMs: number | null;
      statusCode?: number | null;
      tlsExpiry?: Date | null;
      errorMessage?: string | null;
    };

    switch (mon.type) {
      case "http":
        result = await performHttpCheck({
          target: mon.target,
          method: (mon.method as "GET" | "POST" | "HEAD") || "GET",
          timeoutMs: mon.timeoutMs,
          expectedStatusCode: mon.expectedStatusCode || 200,
          headers: mon.headers || undefined,
          body: mon.body || undefined,
        });
        break;

      case "tcp":
        const tcpResult = await performTcpCheck({
          target: mon.target,
          timeoutMs: mon.timeoutMs,
        });
        result = { ...tcpResult, statusCode: null, tlsExpiry: null };
        break;

      case "dns":
        const dnsResult = await performDnsCheck({
          target: mon.target,
          timeoutMs: mon.timeoutMs,
        });
        result = { ...dnsResult, statusCode: null, tlsExpiry: null };
        break;

      case "ssl":
        result = await performSslCheck({
          target: mon.target,
          timeoutMs: mon.timeoutMs,
        });
        break;

      case "ping":
        const pingResult = await performPingCheck({
          target: mon.target,
          timeoutMs: mon.timeoutMs,
        });
        result = { ...pingResult, statusCode: null, tlsExpiry: null };
        break;

      default:
        console.warn(`[worker] Unknown check type: ${mon.type}`);
        return;
    }

    // Process the result (store + status change detection + notifications)
    const { processCheckResult } = await import("../lib/monitoring/evaluator");
    await processCheckResult(
      {
        id: mon.id,
        organizationId: mon.organizationId,
        name: mon.name,
        target: mon.target,
        type: mon.type,
        status: mon.status,
      },
      {
        monitorId: mon.id,
        region,
        status: result.status,
        responseTimeMs: result.responseTimeMs,
        statusCode: result.statusCode ?? null,
        errorMessage: result.errorMessage ?? null,
        tlsExpiry: result.tlsExpiry ?? null,
      }
    );
  },
  {
    connection: redis as any,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 1000,
    },
  }
);

checkWorker.on("completed", (job) => {
  // Quiet log for completed checks
});

checkWorker.on("failed", (job, err) => {
  console.error(`[worker] Check job ${job?.id} failed:`, err.message);
});

// ─── Notification Worker ────────────────────────────────────────

const notificationWorker = new Worker(
  "notifications",
  async (job: Job) => {
    const data = job.data;

    // Handle subscriber notification jobs
    if (data.type === "subscriber-notification") {
      console.log(`[worker] Sending subscriber notification to ${data.email}`);
      await sendIncidentNotificationEmail(
        data.email,
        data.pageName,
        data.incidentTitle,
        data.incidentMessage,
        data.statusPageUrl,
        data.unsubscribeUrl
      );
      return;
    }

    // Handle channel notifications
    const { channelType, config, payload } = data;

    console.log(
      `[worker] Sending ${channelType} notification for "${payload.monitor.name}"`
    );

    switch (channelType) {
      case "email":
        await sendEmailNotification(config, payload);
        break;
      case "slack":
        await sendSlackNotification(config, payload);
        break;
      case "discord":
        await sendDiscordNotification(config, payload);
        break;
      case "webhook":
        await sendWebhookNotification(config, payload);
        break;
      default:
        console.warn(`[worker] Unknown notification type: ${channelType}`);
    }
  },
  {
    connection: redis as any,
    concurrency: 5,
  }
);

notificationWorker.on("failed", (job, err) => {
  console.error(`[worker] Notification job ${job?.id} failed:`, err.message);
});

// ─── Graceful Shutdown ──────────────────────────────────────────

async function shutdown() {
  console.log("[worker] Shutting down...");
  await checkWorker.close();
  await notificationWorker.close();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] Worker processes started and listening for jobs");
