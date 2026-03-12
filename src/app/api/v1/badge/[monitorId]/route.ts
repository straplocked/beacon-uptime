import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors, statusPageMonitors, statusPages, checkResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

function generateBadgeSvg(label: string, value: string, color: string): string {
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="13">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${value}</text>
  </g>
</svg>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  const url = new URL(request.url);
  const label = url.searchParams.get("label") || "uptime";

  // Verify monitor exists and is on a public status page
  const [monitor] = await db
    .select({ id: monitors.id, name: monitors.name })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  if (!monitor) {
    return new Response(generateBadgeSvg(label, "not found", "#999"), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
    });
  }

  // Check if monitor is on any public status page
  const [linked] = await db
    .select({ id: statusPageMonitors.id })
    .from(statusPageMonitors)
    .innerJoin(statusPages, eq(statusPageMonitors.statusPageId, statusPages.id))
    .where(
      and(
        eq(statusPageMonitors.monitorId, monitorId),
        eq(statusPages.isPublic, true)
      )
    )
    .limit(1);

  if (!linked) {
    return new Response(generateBadgeSvg(label, "private", "#999"), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
    });
  }

  // Calculate 30-day uptime
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) AS total_checks,
      COUNT(*) FILTER (WHERE status = 'up') AS up_checks
    FROM check_results
    WHERE monitor_id = ${monitorId}
      AND time > NOW() - INTERVAL '30 days'
  `);

  const row = stats[0] as { total_checks: string; up_checks: string } | undefined;
  const total = parseInt(row?.total_checks || "0");
  const up = parseInt(row?.up_checks || "0");

  let percentage: string;
  let color: string;

  if (total === 0) {
    percentage = "N/A";
    color = "#999";
  } else {
    const pct = (up / total) * 100;
    percentage = pct.toFixed(2) + "%";

    if (pct >= 99) {
      color = "#4c1";
    } else if (pct >= 95) {
      color = "#dfb317";
    } else {
      color = "#e05d44";
    }
  }

  return new Response(generateBadgeSvg(label, percentage, color), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
