import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notificationChannels } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { z } from "zod";
import { canEditResources } from "@/lib/auth/permissions";

const createChannelSchema = z.object({
  type: z.enum(["email", "slack", "discord", "webhook"]),
  name: z.string().min(1).max(100),
  config: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createChannelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { type, name, config } = parsed.data;

  const [channel] = await db
    .insert(notificationChannels)
    .values({
      organizationId: ctx.organization.id,
      createdByUserId: ctx.user.id,
      type,
      name,
      config,
    })
    .returning();

  return NextResponse.json({ channel }, { status: 201 });
}
