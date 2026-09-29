import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { notificationQueue } from "@/lib/queue";
import { isPushConfigured, type PushNotificationPayload } from "./push";

/**
 * K1 802 — fans a monitor status change out to every push subscription in
 * the monitor's organization, through the same `notifications` BullMQ
 * queue the email/Slack/Discord/webhook channels use. Called from
 * `src/lib/monitoring/evaluator.ts`, gated on `isPushConfigured()` so the
 * whole feature is a no-op (not an error) when VAPID env vars aren't set.
 */
export interface PushFanoutMonitorEvent {
  organizationId: string;
  monitorId: string;
  monitorName: string;
  status: "up" | "down" | "degraded";
  /** Open this incident's thread on click when one exists for the event. */
  incidentId: string | null;
}

export function buildMonitorPushPayload(
  event: PushFanoutMonitorEvent,
): PushNotificationPayload {
  const baseUrl = (process.env.BASE_URL || "http://localhost:3100").replace(
    /\/$/,
    "",
  );
  const isDown = event.status === "down" || event.status === "degraded";
  const url = event.incidentId
    ? `${baseUrl}/incidents/${event.incidentId}`
    : `${baseUrl}/monitors/${event.monitorId}`;

  return {
    title: isDown
      ? `${event.monitorName} is ${event.status}`
      : `${event.monitorName} is back up`,
    body: isDown
      ? `Beacon detected a problem with ${event.monitorName}.`
      : `${event.monitorName} has recovered.`,
    url,
    tag: `beacon-monitor-${event.monitorId}`,
  };
}

export async function enqueuePushNotifications(
  event: PushFanoutMonitorEvent,
): Promise<void> {
  if (!isPushConfigured()) return;

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.organizationId, event.organizationId));

  if (subscriptions.length === 0) return;

  const payload = buildMonitorPushPayload(event);

  for (const sub of subscriptions) {
    await notificationQueue.add(
      `push-${sub.id}`,
      {
        type: "push-notification",
        subscriptionId: sub.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        payload,
      },
      { priority: event.status === "down" ? 1 : 3 },
    );
  }

  console.log(
    `[push-fanout] Enqueued ${subscriptions.length} push notification(s) for "${event.monitorName}"`,
  );
}
