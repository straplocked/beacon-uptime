import webpush from "web-push";

/**
 * Browser push delivery (K1 802). Mirrors the shape of the other
 * `src/lib/notifications/*` senders: a pure function that takes a config
 * (here, a Web Push subscription) and a payload, and sends it. All DB
 * lookups (which subscriptions to send to, pruning dead ones) live in
 * push-fanout.ts / the worker, not here.
 *
 * The feature is entirely env-gated: if VAPID_PUBLIC_KEY or
 * VAPID_PRIVATE_KEY aren't set, `isPushConfigured()` returns false and
 * every call site (API routes, evaluator fan-out) skips push rather than
 * failing. `VAPID_SUBJECT` should be a `mailto:` address or https URL per
 * the Web Push spec; it defaults to a generic mailto so setup isn't
 * strictly blocked on it.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Absolute URL to open when the notification is clicked. */
  url: string;
  /** Used to dedupe/replace stacked notifications for the same monitor. */
  tag?: string;
}

/** True once all three VAPID env vars needed to send push are present. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error(
      "[notifications/push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set",
    );
  }
  const subject = process.env.VAPID_SUBJECT || "mailto:alerts@beacon.local";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export class PushSendError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
  ) {
    super(message);
    this.name = "PushSendError";
  }
}

/** True for the status codes that mean "this subscription is dead, delete it". */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Send a single push notification. Throws `PushSendError` on failure —
 * callers (the worker) should prune the subscription when
 * `isGoneStatus(err.statusCode)` is true, and otherwise let BullMQ retry.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: PushNotificationPayload,
): Promise<void> {
  ensureVapidConfigured();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    console.log(`[notifications/push] Sent to ${subscription.endpoint}`);
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    throw new PushSendError(`Push send failed: ${message}`, statusCode);
  }
}
