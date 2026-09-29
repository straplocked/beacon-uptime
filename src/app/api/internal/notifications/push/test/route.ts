import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import {
  isGoneStatus,
  isPushConfigured,
  PushSendError,
  sendPushNotification,
} from "@/lib/notifications/push";

/**
 * K1 802 — "Send test" button in Settings. Sends a test push to every
 * subscription the signed-in user has registered (across all their
 * devices/browsers), pruning any that turn out to be dead. Delivered
 * synchronously (not through the notifications queue) so the button gets
 * an immediate success/failure result instead of "check your device".
 */
export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications are not configured on this server" },
      { status: 404 },
    );
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, ctx.user.id));

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "No push subscriptions registered for your account yet" },
      { status: 400 },
    );
  }

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: "Beacon test notification",
          body: "Push notifications are working.",
          url: `${(process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "")}/settings`,
          tag: "beacon-test",
        },
      );
      sent++;
    } catch (err) {
      if (err instanceof PushSendError && isGoneStatus(err.statusCode)) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
        pruned++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({ sent, pruned, failed });
}
