import { db } from "@/lib/db";
import {
  monitors,
  checkResults,
  incidents,
  incidentUpdates,
  statusPageMonitors,
  statusPages,
  subscribers,
  organizations,
  notificationChannels,
} from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { notificationQueue } from "@/lib/queue";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { edition } from "@/lib/edition";

type MonitorStatus = "up" | "down" | "degraded" | "paused" | "pending";
type CheckStatus = "up" | "down" | "degraded";

interface CheckResultData {
  monitorId: string;
  region: string;
  status: CheckStatus;
  responseTimeMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  tlsExpiry: Date | null;
}

/**
 * Stores a check result and handles status transitions.
 * If the monitor's status changed, triggers notifications and auto-incidents.
 */
export async function processCheckResult(
  monitor: {
    id: string;
    organizationId: string;
    name: string;
    target: string;
    type: string;
    status: MonitorStatus;
  },
  result: CheckResultData
) {
  // 1. Write check result to DB
  await db.insert(checkResults).values({
    time: new Date(),
    monitorId: result.monitorId,
    region: result.region,
    status: result.status,
    responseTimeMs: result.responseTimeMs,
    statusCode: result.statusCode,
    errorMessage: result.errorMessage,
    tlsExpiry: result.tlsExpiry,
  });

  // 2. Update monitor status + last_checked_at
  const previousStatus = monitor.status;
  const newStatus = result.status;

  await db
    .update(monitors)
    .set({
      status: newStatus,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitor.id));

  // 3. Check if status changed (ignoring initial pending state)
  const statusChanged =
    previousStatus !== "pending" &&
    previousStatus !== "paused" &&
    previousStatus !== newStatus;

  if (!statusChanged) return;

  console.log(
    `[evaluator] Monitor "${monitor.name}" status changed: ${previousStatus} → ${newStatus}`
  );

  // 4. Auto-incident management
  if (newStatus === "down" || newStatus === "degraded") {
    await createAutoIncident(monitor, result);
  } else if (newStatus === "up" && (previousStatus === "down" || previousStatus === "degraded")) {
    await resolveAutoIncidents(monitor);
  }

  // 5. Trigger notification jobs
  await enqueueNotifications(monitor, previousStatus, newStatus, result);
}

async function createAutoIncident(
  monitor: { id: string; organizationId: string; name: string; target: string; type: string },
  result: CheckResultData
) {
  // Find status pages that include this monitor
  const linkedPages = await db
    .select({ statusPageId: statusPageMonitors.statusPageId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.monitorId, monitor.id));

  for (const { statusPageId } of linkedPages) {
    // Check if there's already an open incident for this monitor on this page
    const existingIncident = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.statusPageId, statusPageId),
          isNull(incidents.resolvedAt),
          ne(incidents.status, "resolved")
        )
      )
      .limit(1);

    if (existingIncident.length > 0) continue;

    // Create auto-incident
    const impact = result.status === "down" ? "major" : "minor";
    const [incident] = await db
      .insert(incidents)
      .values({
        organizationId: monitor.organizationId,
        createdByUserId: null,
        statusPageId,
        title: `${monitor.name} is ${result.status === "down" ? "down" : "experiencing issues"}`,
        status: "investigating",
        impact: impact as "none" | "minor" | "major" | "critical",
      })
      .returning();

    // Add initial update
    await db.insert(incidentUpdates).values({
      incidentId: incident.id,
      status: "investigating",
      message: result.errorMessage
        ? `Automated alert: ${result.errorMessage}`
        : `Automated alert: ${monitor.name} is ${result.status}.`,
    });

    console.log(`[evaluator] Auto-created incident for "${monitor.name}" on status page ${statusPageId}`);

    // Notify subscribers
    await enqueueSubscriberNotifications(
      monitor.organizationId,
      statusPageId,
      incident.id,
      incident.title,
      result.errorMessage
        ? `Automated alert: ${result.errorMessage}`
        : `Automated alert: ${monitor.name} is ${result.status}.`
    );
  }
}

async function resolveAutoIncidents(
  monitor: { id: string; organizationId: string; name: string }
) {
  const linkedPages = await db
    .select({ statusPageId: statusPageMonitors.statusPageId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.monitorId, monitor.id));

  for (const { statusPageId } of linkedPages) {
    const openIncidents = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.statusPageId, statusPageId),
          isNull(incidents.resolvedAt),
          ne(incidents.status, "resolved")
        )
      );

    for (const incident of openIncidents) {
      await db
        .update(incidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, incident.id));

      await db.insert(incidentUpdates).values({
        incidentId: incident.id,
        status: "resolved",
        message: `${monitor.name} has recovered and is operational.`,
      });

      console.log(`[evaluator] Auto-resolved incident ${incident.id}`);
    }
  }
}

async function enqueueNotifications(
  monitor: { id: string; organizationId: string; name: string; target: string; type: string },
  previousStatus: string,
  newStatus: string,
  result: CheckResultData
) {
  // Get user's notification channels
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.organizationId, monitor.organizationId));

  if (channels.length === 0) return;

  const event =
    newStatus === "down"
      ? "monitor.down"
      : newStatus === "up"
        ? "monitor.up"
        : "monitor.degraded";

  const payload = {
    event,
    monitor: {
      id: monitor.id,
      name: monitor.name,
      target: monitor.target,
      type: monitor.type,
    },
    check: {
      status: result.status,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      error: result.errorMessage,
      checkedAt: new Date().toISOString(),
      region: result.region,
    },
    previousStatus,
  };

  for (const channel of channels) {
    await notificationQueue.add(
      `notify-${channel.type}-${channel.id}`,
      {
        channelId: channel.id,
        channelType: channel.type,
        config: channel.config,
        payload,
      },
      { priority: newStatus === "down" ? 1 : 3 }
    );
  }

  console.log(
    `[evaluator] Enqueued ${channels.length} notification(s) for "${monitor.name}" (${event})`
  );
}

async function enqueueSubscriberNotifications(
  organizationId: string,
  statusPageId: string,
  incidentId: string,
  incidentTitle: string,
  incidentMessage: string
) {
  // Check if organization's plan allows subscriber notifications
  if (edition.enforcePlanLimits) {
    const [org] = await db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org || !PLAN_LIMITS[org.plan as PlanType]?.subscriberNotifications) {
      return;
    }
  }

  // Get the status page for URL building
  const [page] = await db
    .select({ slug: statusPages.slug, name: statusPages.name })
    .from(statusPages)
    .where(eq(statusPages.id, statusPageId))
    .limit(1);

  if (!page) return;

  // Get confirmed, active subscribers
  const confirmedSubscribers = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.statusPageId, statusPageId),
        eq(subscribers.confirmed, true),
        isNull(subscribers.unsubscribedAt)
      )
    );

  if (confirmedSubscribers.length === 0) return;

  const baseUrl = process.env.BASE_URL || "https://beacon.pluginsynthesis.com";

  for (const sub of confirmedSubscribers) {
    await notificationQueue.add(
      `subscriber-notify-${sub.id}`,
      {
        type: "subscriber-notification",
        email: sub.email,
        pageName: page.name,
        incidentTitle,
        incidentMessage,
        statusPageUrl: `${baseUrl}/s/${page.slug}`,
        unsubscribeUrl: `${baseUrl}/api/public/unsubscribe/${sub.confirmationToken}`,
      },
      { priority: 2 }
    );
  }

  console.log(
    `[evaluator] Enqueued ${confirmedSubscribers.length} subscriber notification(s) for incident "${incidentTitle}"`
  );
}
