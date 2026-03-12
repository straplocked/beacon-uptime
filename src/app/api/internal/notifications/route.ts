import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notificationChannels } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { canAddNotificationChannel } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";

const createChannelSchema = z.object({
  type: z.enum(["email", "slack", "discord", "webhook"]),
  name: z.string().min(1).max(100),
  config: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createChannelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check plan limits
  const [channelCount] = await db
    .select({ count: count() })
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, user.id));

  if (!canAddNotificationChannel(user.plan as PlanType, channelCount.count)) {
    return NextResponse.json(
      { error: "Notification channel limit reached for your plan" },
      { status: 403 }
    );
  }

  const { type, name, config } = parsed.data;

  const [channel] = await db
    .insert(notificationChannels)
    .values({
      userId: user.id,
      type,
      name,
      config,
    })
    .returning();

  return NextResponse.json({ channel }, { status: 201 });
}
