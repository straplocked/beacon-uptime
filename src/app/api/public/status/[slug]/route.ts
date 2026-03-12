import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  statusPages,
  statusPageMonitors,
  monitors,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { withRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(request);
  const rateLimited = await withRateLimit(request, `widget:${ip}`, 30, 60);
  if (rateLimited) return rateLimited;

  const { slug } = await params;

  const [page] = await db
    .select({
      id: statusPages.id,
      name: statusPages.name,
      slug: statusPages.slug,
      isPublic: statusPages.isPublic,
      userId: statusPages.userId,
    })
    .from(statusPages)
    .where(eq(statusPages.slug, slug))
    .limit(1);

  if (!page || !page.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check plan allows widget
  const [owner] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, page.userId))
    .limit(1);

  if (!owner || !PLAN_LIMITS[owner.plan as PlanType]?.floatingWidget) {
    return NextResponse.json(
      { error: "Widget not available on this plan" },
      { status: 403 }
    );
  }

  const linkedMonitors = await db
    .select({
      displayName: statusPageMonitors.displayName,
      monitorName: monitors.name,
      monitorStatus: monitors.status,
    })
    .from(statusPageMonitors)
    .innerJoin(monitors, eq(statusPageMonitors.monitorId, monitors.id))
    .where(eq(statusPageMonitors.statusPageId, page.id))
    .orderBy(statusPageMonitors.sortOrder);

  const components = linkedMonitors.map((m) => ({
    name: m.displayName || m.monitorName,
    status: m.monitorStatus,
  }));

  // Determine overall status
  const hasDown = components.some((c) => c.status === "down");
  const hasDegraded = components.some((c) => c.status === "degraded");

  let overallStatus = "operational";
  if (hasDown) overallStatus = "major_outage";
  else if (hasDegraded) overallStatus = "degraded";

  const baseUrl = process.env.BASE_URL || "https://beacon.pluginsynthesis.com";

  return NextResponse.json(
    {
      status: overallStatus,
      name: page.name,
      url: `${baseUrl}/s/${page.slug}`,
      components,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
