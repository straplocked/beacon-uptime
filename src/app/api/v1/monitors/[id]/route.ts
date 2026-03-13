import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors, checkResults } from "@/lib/db/schema";
import { getApiKeyOrg } from "@/lib/auth/api-key";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { withRateLimit } from "@/lib/rate-limit";

const updateMonitorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  intervalSeconds: z.number().int().min(30).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  expectedStatusCode: z.number().int().optional(),
  method: z.enum(["GET", "POST", "HEAD"]).optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  body: z.string().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const org = await getApiKeyOrg(request);
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(org.plan as PlanType)) {
    return NextResponse.json({ error: "API access not available on your plan" }, { status: 403 });
  }

  const rateLimited = await withRateLimit(request, `api:${org.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.organizationId, org.id)))
    .limit(1);

  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const recentChecks = await db
    .select()
    .from(checkResults)
    .where(eq(checkResults.monitorId, id))
    .orderBy(desc(checkResults.time))
    .limit(20);

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
  const org = await getApiKeyOrg(request);
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(org.plan as PlanType)) {
    return NextResponse.json({ error: "API access not available on your plan" }, { status: 403 });
  }

  const rateLimited = await withRateLimit(request, `api:${org.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.organizationId, org.id)))
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

  const data = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.intervalSeconds !== undefined) updateData.intervalSeconds = data.intervalSeconds;
  if (data.timeoutMs !== undefined) updateData.timeoutMs = data.timeoutMs;
  if (data.expectedStatusCode !== undefined) updateData.expectedStatusCode = data.expectedStatusCode;
  if (data.method !== undefined) updateData.method = data.method;
  if (data.headers !== undefined) updateData.headers = data.headers;
  if (data.body !== undefined) updateData.body = data.body;

  const [updated] = await db
    .update(monitors)
    .set(updateData)
    .where(eq(monitors.id, id))
    .returning();

  return NextResponse.json({ monitor: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const org = await getApiKeyOrg(request);
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(org.plan as PlanType)) {
    return NextResponse.json({ error: "API access not available on your plan" }, { status: 403 });
  }

  const rateLimited = await withRateLimit(request, `api:${org.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.organizationId, org.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  await db.delete(monitors).where(eq(monitors.id, id));

  return NextResponse.json({ success: true });
}
