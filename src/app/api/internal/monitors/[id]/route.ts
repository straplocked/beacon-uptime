import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors, checkResults } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { monitorCheckQueue } from "@/lib/queue";

const updateMonitorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  target: z.string().min(1).optional(),
  intervalSeconds: z.number().int().min(30).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  expectedStatusCode: z.number().int().optional(),
  method: z.enum(["GET", "POST", "HEAD"]).optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  body: z.string().nullable().optional(),
  isPaused: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  // Get recent check results
  const recentChecks = await db
    .select()
    .from(checkResults)
    .where(eq(checkResults.monitorId, id))
    .orderBy(desc(checkResults.time))
    .limit(100);

  // Get uptime stats (last 24h)
  const uptimeStats = await db.execute(sql`
    SELECT
      COUNT(*) AS total_checks,
      COUNT(*) FILTER (WHERE status = 'up') AS up_checks,
      ROUND(AVG(response_time_ms)) AS avg_response_time
    FROM check_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
  `);

  return NextResponse.json({
    monitor,
    recentChecks,
    uptimeStats: uptimeStats[0] || null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateMonitorSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const data = parsed.data;

  if (data.name !== undefined) updateData.name = data.name;
  if (data.target !== undefined) updateData.target = data.target;
  if (data.intervalSeconds !== undefined) updateData.intervalSeconds = data.intervalSeconds;
  if (data.timeoutMs !== undefined) updateData.timeoutMs = data.timeoutMs;
  if (data.expectedStatusCode !== undefined) updateData.expectedStatusCode = data.expectedStatusCode;
  if (data.method !== undefined) updateData.method = data.method;
  if (data.headers !== undefined) updateData.headers = data.headers;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.isPaused !== undefined) {
    updateData.isPaused = data.isPaused;
    updateData.status = data.isPaused ? "paused" : "pending";
  }

  const [updated] = await db
    .update(monitors)
    .set(updateData)
    .where(eq(monitors.id, id))
    .returning();

  // Enqueue immediate check when unpausing (skip heartbeat monitors)
  if (data.isPaused === false && updated.type !== "heartbeat") {
    const jobId = `check-${updated.id}`;
    await monitorCheckQueue.add(jobId, { monitorId: updated.id }, {
      jobId,
      deduplication: { id: jobId },
    });
  }

  return NextResponse.json({ monitor: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  await db.delete(monitors).where(eq(monitors.id, id));

  return NextResponse.json({ success: true });
}
