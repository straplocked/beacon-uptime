import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isPushConfigured } from "@/lib/notifications/push";

/**
 * K1 802 — registers/removes this browser's PushSubscription against the
 * signed-in user. Keyed by (userId, endpoint): re-subscribing the same
 * browser updates the row instead of creating a duplicate.
 */

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent");

  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, ctx.user.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: keys.p256dh,
        auth: keys.auth,
        organizationId: ctx.organization.id,
        userAgent,
        lastSeenAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id));
  } else {
    await db.insert(pushSubscriptions).values({
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, ctx.user.id),
        eq(pushSubscriptions.endpoint, parsed.data.endpoint),
      ),
    );

  return NextResponse.json({ success: true });
}
