import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, desc, count } from "drizzle-orm";
import { z } from "zod";
import { canAddMonitor, getMinCheckInterval } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { monitorCheckQueue } from "@/lib/queue";
import { canEditResources } from "@/lib/auth/permissions";

const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["http", "ping", "tcp", "dns", "ssl", "heartbeat"]),
  target: z.string().min(1),
  intervalSeconds: z.number().int().min(30).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  expectedStatusCode: z.number().int().optional(),
  method: z.enum(["GET", "POST", "HEAD"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.organizationId, ctx.organization.id))
    .orderBy(desc(monitors.createdAt));

  return NextResponse.json({ monitors: orgMonitors });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createMonitorSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check plan limits
  const plan = ctx.organization.plan as PlanType;
  const [monitorCount] = await db
    .select({ count: count() })
    .from(monitors)
    .where(eq(monitors.organizationId, ctx.organization.id));

  if (!canAddMonitor(plan, monitorCount.count)) {
    return NextResponse.json(
      { error: "Monitor limit reached for your plan" },
      { status: 403 }
    );
  }

  const data = parsed.data;
  const minInterval = getMinCheckInterval(plan);
  const intervalSeconds = Math.max(data.intervalSeconds || 60, minInterval);

  // Generate heartbeat token if needed
  let heartbeatToken: string | undefined;
  let heartbeatIntervalSeconds: number | undefined;
  if (data.type === "heartbeat") {
    heartbeatToken = crypto.randomUUID();
    heartbeatIntervalSeconds = intervalSeconds;
  }

  const [monitor] = await db
    .insert(monitors)
    .values({
      organizationId: ctx.organization.id,
      createdByUserId: ctx.user.id,
      name: data.name,
      type: data.type,
      target: data.target,
      intervalSeconds,
      timeoutMs: data.timeoutMs || 10000,
      expectedStatusCode: data.expectedStatusCode || 200,
      method: data.method || "GET",
      headers: data.headers || null,
      body: data.body || null,
      status: "pending",
      heartbeatToken,
      heartbeatIntervalSeconds,
    })
    .returning();

  // Enqueue immediate check (skip for heartbeat — those wait for external ping)
  if (data.type !== "heartbeat") {
    await monitorCheckQueue.add(`check-${monitor.id}`, { monitorId: monitor.id }, {
      deduplication: { id: `check-${monitor.id}` },
    });
  }

  return NextResponse.json({ monitor }, { status: 201 });
}
