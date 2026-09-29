import { db } from "@/lib/db";
import {
  monitors,
  checkResults,
  incidents,
  incidentUpdates,
  statusPageMonitors,
  statusPages,
  subscribers,
  notificationChannels,
} from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { notificationQueue } from "@/lib/queue";
import { clampRetryInterval, DEFAULT_RETRY_INTERVAL_SECONDS } from "@/lib/monitoring/limits";
import { enqueuePushNotifications } from "@/lib/notifications/push-fanout";

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
 *
 * ─── Retry / confirmation policy (E5) ──────────────────────────────────
 * A single failing check no longer flips a monitor straight to
 * down/degraded and pages everyone. `monitor.confirmationCount` consecutive
 * failing checks are required first; `monitor.consecutiveFailures` tracks
 * progress toward that threshold and resets to 0 on any successful check.
 *
 * While a failure is unconfirmed, the monitor's *displayed* status is left
 * exactly where it was — a monitor that was "up" stays "up" (the failure is
 * still visible as a "down"/"degraded" row in check history, since the
 * check_results insert below always records the raw probe result), and a
 * brand-new "pending" monitor stays "pending" until confirmed one way or
 * the other. This was chosen over inventing a new "verifying" status: it
 * reuses "pending" for exactly the ambiguity it already represents ("we
 * don't have a confirmed read yet"), needs no new enum value/migration, and
 * for an established "up" monitor it's the least surprising option — no
 * flicker to "down" and back for a single blip.
 *
 * Recovery (any confirmed failure -> "up") is always immediate, per spec.
 *
 * While unconfirmed, `nextCheckAt` is set to fire the retry sooner than the
 * monitor's normal `intervalSeconds` cadence (see `clampRetryInterval`);
 * it's cleared the moment a failure is confirmed or the monitor recovers,
 * handing scheduling back to the normal interval.
 */
export async function processCheckResult(
  monitor: {
    id: string;
    organizationId: string;
    name: string;
    target: string;
    type: string;
    status: MonitorStatus;
    confirmationCount?: number;
    consecutiveFailures?: number;
    retryIntervalSeconds?: number;
    intervalSeconds?: number;
  },
  result: CheckResultData
) {
  // 1. Write the raw check result to DB — always the actual probe outcome,
  // independent of confirmation gating, so check history always shows what
  // actually happened on every single check.
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

  // 2. Work out the (possibly gated) monitor-level status transition.
  const previousStatus = monitor.status;
  const previousFailures = monitor.consecutiveFailures ?? 0;
  const confirmationCount = Math.max(1, monitor.confirmationCount ?? 1);
  const retryIntervalSeconds =
    monitor.retryIntervalSeconds ?? DEFAULT_RETRY_INTERVAL_SECONDS;
  const intervalSeconds = monitor.intervalSeconds ?? 60;

  const isFailure = result.status !== "up";

  let newStatus: MonitorStatus;
  let newConsecutiveFailures: number;
  let confirmed: boolean;

  if (!isFailure) {
    // Recovery is unconditional and immediate.
    newConsecutiveFailures = 0;
    newStatus = "up";
    confirmed = true;
  } else {
    newConsecutiveFailures = previousFailures + 1;
    if (newConsecutiveFailures >= confirmationCount) {
      newStatus = result.status; // "down" | "degraded"
      confirmed = true;
    } else {
      newStatus = previousStatus; // unconfirmed — least-surprising: stay put
      confirmed = false;
    }
  }

  const nextCheckAt = confirmed
    ? null
    : new Date(
        Date.now() +
          clampRetryInterval(retryIntervalSeconds, intervalSeconds) * 1000
      );

  await db
    .update(monitors)
    .set({
      status: newStatus,
      consecutiveFailures: newConsecutiveFailures,
      nextCheckAt,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitor.id));

  // 3. Check if status changed (ignoring initial pending state). Note this
  // is automatically false while a failure is unconfirmed, since newStatus
  // === previousStatus by construction above — no separate gate needed.
  const statusChanged =
    previousStatus !== "pending" &&
    previousStatus !== "paused" &&
    previousStatus !== newStatus;

  if (!statusChanged) return;

  console.log(
    `[evaluator] Monitor "${monitor.name}" status changed: ${previousStatus} → ${newStatus}`
  );

  // 4. Auto-incident management
  let affectedIncidentIds: string[] = [];
  if (newStatus === "down" || newStatus === "degraded") {
    affectedIncidentIds = await createAutoIncident(monitor, result);
  } else if (newStatus === "up" && (previousStatus === "down" || previousStatus === "degraded")) {
    affectedIncidentIds = await resolveAutoIncidents(monitor);
  }

  // 5. Trigger notification jobs
  await enqueueNotifications(
    monitor,
    previousStatus,
    newStatus,
    result,
    affectedIncidentIds[0] ?? null,
  );
}

async function createAutoIncident(
  monitor: { id: string; organizationId: string; name: string; target: string; type: string },
  result: CheckResultData
): Promise<string[]> {
  // Find status pages that include this monitor
  const linkedPages = await db
    .select({ statusPageId: statusPageMonitors.statusPageId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.monitorId, monitor.id));

  const incidentIds: string[] = [];

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

    if (existingIncident.length > 0) {
      incidentIds.push(existingIncident[0].id);
      continue;
    }

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
    incidentIds.push(incident.id);

    // Notify subscribers
    await enqueueSubscriberNotifications(
      statusPageId,
      incident.id,
      incident.title,
      result.errorMessage
        ? `Automated alert: ${result.errorMessage}`
        : `Automated alert: ${monitor.name} is ${result.status}.`
    );
  }

  return incidentIds;
}

async function resolveAutoIncidents(
  monitor: { id: string; organizationId: string; name: string }
): Promise<string[]> {
  const linkedPages = await db
    .select({ statusPageId: statusPageMonitors.statusPageId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.monitorId, monitor.id));

  const incidentIds: string[] = [];

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
      incidentIds.push(incident.id);
    }
  }

  return incidentIds;
}

async function enqueueNotifications(
  monitor: { id: string; organizationId: string; name: string; target: string; type: string },
  previousStatus: string,
  newStatus: string,
  result: CheckResultData,
  incidentId: string | null
) {
  // Get user's notification channels
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.organizationId, monitor.organizationId));

  // Browser push (K1 802) fans out independently of org channels — it's
  // per-user, not per-org, and a no-op when VAPID env vars aren't set.
  await enqueuePushNotifications({
    organizationId: monitor.organizationId,
    monitorId: monitor.id,
    monitorName: monitor.name,
    status: newStatus as "up" | "down" | "degraded",
    incidentId,
  });

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
  statusPageId: string,
  incidentId: string,
  incidentTitle: string,
  incidentMessage: string
) {
  // Subscriber notifications are unconditional: Beacon is a single
  // open-source edition with no plan gating.

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
