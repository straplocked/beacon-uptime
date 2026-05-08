/**
 * P-MON-LIST — Monitor list page.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-MON-LIST).
 * Reuses the shared MonitorTable component (also rendered on the dashboard
 * in compact form). Page-level chrome lives here; the table renders bare.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import {
  MonitorTable,
  type MonitorRow,
} from "@/components/monitors/monitor-table";
import type { MonitorStatus } from "@/components/dashboard/status-indicators";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkResults, monitors } from "@/lib/db/schema";

function uptimePctFromCounts(success: number, total: number): number | null {
  if (total === 0) return null;
  return (success / total) * 100;
}

function toMonitorStatus(s: string): MonitorStatus {
  if (
    s === "up" ||
    s === "down" ||
    s === "degraded" ||
    s === "paused" ||
    s === "pending"
  )
    return s;
  return "pending";
}

export default async function MonitorsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const orgId = ctx.organization.id;
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const orgMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.organizationId, orgId))
    .orderBy(desc(monitors.createdAt));

  const rows: MonitorRow[] = await Promise.all(
    orgMonitors.map(async (m) => {
      const recent = await db
        .select({
          time: checkResults.time,
          status: checkResults.status,
          responseTimeMs: checkResults.responseTimeMs,
        })
        .from(checkResults)
        .where(eq(checkResults.monitorId, m.id))
        .orderBy(desc(checkResults.time))
        .limit(48);
      const seriesAsc = recent.slice().reverse();
      const series = seriesAsc
        .map((r) => r.responseTimeMs)
        .filter((x): x is number => typeof x === "number");

      const agg = await db
        .select({
          total: sql<number>`count(*)::int`,
          success: sql<
            number
          >`count(*) filter (where ${checkResults.status} = 'up')::int`,
          p50: sql<
            number | null
          >`percentile_cont(0.5) within group (order by ${checkResults.responseTimeMs})::int`,
          p95: sql<
            number | null
          >`percentile_cont(0.95) within group (order by ${checkResults.responseTimeMs})::int`,
          p99: sql<
            number | null
          >`percentile_cont(0.99) within group (order by ${checkResults.responseTimeMs})::int`,
        })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, m.id),
            gte(checkResults.time, twentyFourHoursAgo),
          ),
        );

      const daily = await db
        .select({
          day: sql<string>`date_trunc('day', ${checkResults.time})::date::text`,
          total: sql<number>`count(*)::int`,
          fails: sql<
            number
          >`count(*) filter (where ${checkResults.status} != 'up')::int`,
        })
        .from(checkResults)
        .where(
          and(
            eq(checkResults.monitorId, m.id),
            gte(checkResults.time, ninetyDaysAgo),
          ),
        )
        .groupBy(sql`date_trunc('day', ${checkResults.time})`);

      const dayMap = new Map<string, { total: number; fails: number }>();
      for (const d of daily) dayMap.set(d.day, { total: d.total, fails: d.fails });
      const uptime90Series: ("up" | "degraded" | "down" | "empty")[] = [];
      for (let i = 0; i < 90; i++) {
        const d = new Date(now.getTime() - (89 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const stats = dayMap.get(key);
        if (!stats || stats.total === 0) uptime90Series.push("empty");
        else {
          const failRate = stats.fails / stats.total;
          if (failRate === 0) uptime90Series.push("up");
          else if (failRate < 0.1) uptime90Series.push("degraded");
          else uptime90Series.push("down");
        }
      }
      const successDays = uptime90Series.filter((s) => s === "up").length;
      const tracked = uptime90Series.filter((s) => s !== "empty").length;
      const uptime90d = tracked > 0 ? (successDays / tracked) * 100 : null;
      const a = agg[0];

      const lastResult = seriesAsc[seriesAsc.length - 1];
      return {
        id: m.id,
        name: m.name,
        target: m.target,
        type: m.type.toUpperCase(),
        status: toMonitorStatus(m.status),
        lastResponseMs: lastResult?.responseTimeMs ?? null,
        lastCheckAgoSec: m.lastCheckedAt
          ? Math.floor((now.getTime() - m.lastCheckedAt.getTime()) / 1000)
          : null,
        series,
        uptime24h: uptimePctFromCounts(a?.success ?? 0, a?.total ?? 0),
        uptime90d,
        uptime90Series,
        intervalSec: m.intervalSeconds,
        p50Ms: a?.p50 ?? null,
        p95Ms: a?.p95 ?? null,
        p99Ms: a?.p99 ?? null,
      };
    }),
  );

  const availableTypes = Array.from(
    new Set(orgMonitors.map((m) => m.type.toLowerCase())),
  );

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
            Monitors
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            {orgMonitors.length} monitor{orgMonitors.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/monitors/new"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            New monitor
          </Link>
        </div>
      </div>

      <MonitorTable
        monitors={rows}
        title={null}
        enableTypeFilter
        availableTypes={availableTypes}
        autoExpandFirstIssue={false}
      />
    </div>
  );
}
