import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { getApiKeyUser } from "@/lib/auth/api-key";
import { eq, and } from "drizzle-orm";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { withRateLimit } from "@/lib/rate-limit";
import { monitorCheckQueue } from "@/lib/queue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApiKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(user.plan as PlanType)) {
    return NextResponse.json({ error: "API access not available on your plan" }, { status: 403 });
  }

  const rateLimited = await withRateLimit(request, `api:${user.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(monitors)
    .set({ isPaused: false, status: "pending", updatedAt: new Date() })
    .where(eq(monitors.id, id))
    .returning();

  // Enqueue immediate check (skip heartbeat monitors)
  if (updated.type !== "heartbeat") {
    await monitorCheckQueue.add(`check-${updated.id}`, { monitorId: updated.id }, {
      deduplication: { id: `check-${updated.id}` },
    });
  }

  return NextResponse.json({ monitor: updated });
}
