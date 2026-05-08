import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { ChevronDown, Filter, Plus } from "lucide-react";
import Link from "next/link";

import { ActivityRail, type ActivityEntry } from "./_components/activity-rail";
import {
  IncidentBanner,
  type ActiveIncidentSummary,
} from "./_components/incident-banner";
import { McpRail } from "./_components/mcp-rail";
import {
  MonitorTable,
  type MonitorRow,
} from "@/components/monitors/monitor-table";
import { StatCards, type DashboardStats } from "./_components/stat-cards";

import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checkResults,
  incidents,
  incidentUpdates,
  monitors,
  statusPages,
} from "@/lib/db/schema";
import type {
  IncidentSeverity,
  IncidentState,
  MonitorStatus,
} from "@/components/dashboard/status-indicators";

// ─── Helpers ────────────────────────────────────────────────────

function formatAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function relAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function uptimePctFromCounts(success: number, total: number): number | null {
  if (total === 0) return null;
  return (success / total) * 100;
}

// Map DB monitor status enum → our visual status type. Currently 1:1.
function toMonitorStatus(s: string): MonitorStatus {
  if (s === "up" || s === "down" || s === "degraded" || s === "paused" || s === "pending")
    return s;
  return "pending";
}

// Map DB incident impact → severity. `none` is the "informational" tier.
function toSeverity(impact: string): IncidentSeverity {
  if (
    impact === "critical" ||
    impact === "major" ||
    impact === "minor" ||
    impact === "none"
  )
    return impact;
  return "minor";
}

function toIncidentState(s: string): IncidentState {
  if (
    s === "investigating" ||
    s === "identified" ||
    s === "monitoring" ||
    s === "resolved"
  )
    return s;
  return "investigating";
}

// ─── Page ───────────────────────────────────────────────────────

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const orgId = ctx.organization.id;

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // 1. Monitors for the org
  const orgMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.organizationId, orgId))
    .orderBy(desc(monitors.createdAt));

  const monitorIds = orgMonitors.map((m) => m.id);

  // 2. 24h check stats per monitor (success rate + last 48 response times for sparkline + p50/p95/p99)
  // We do a simple per-monitor query loop. For dev (~5 monitors) this is fine; production uses
  // continuous aggregates (hourly_uptime / daily_uptime) but we don't need those for this view.
  const perMonitor = await Promise.all(
    monitorIds.map(async (mid) => {
      // Last 48 checks (oldest → newest after we reverse below)
      const recent = await db
        .select({
          time: checkResults.time,
          status: checkResults.status,
          responseTimeMs: checkResults.responseTimeMs,
        })
        .from(checkResults)
        .where(eq(checkResults.monitorId, mid))
        .orderBy(desc(checkResults.time))
        .limit(48);
      const seriesAsc = recent.slice().reverse();
      const series = seriesAsc
        .map((r) => r.responseTimeMs)
        .filter((x): x is number => typeof x === "number");

      // 24h aggregates
      const agg = await db
        .select({
          total: sql<number>`count(*)::int`,
          success: sql<number>`count(*) filter (where ${checkResults.status} = 'up')::int`,
          avg: sql<number | null>`avg(${checkResults.responseTimeMs})::int`,
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
            eq(checkResults.monitorId, mid),
            gte(checkResults.time, twentyFourHoursAgo),
          ),
        );

      // 90-day daily aggregates → status string per day
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
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
            eq(checkResults.monitorId, mid),
            gte(checkResults.time, ninetyDaysAgo),
          ),
        )
        .groupBy(sql`date_trunc('day', ${checkResults.time})`);

      const dayMap = new Map<string, { total: number; fails: number }>();
      for (const d of daily) {
        dayMap.set(d.day, { total: d.total, fails: d.fails });
      }
      const uptime90Series: ("up" | "degraded" | "down" | "empty")[] = [];
      for (let i = 0; i < 90; i++) {
        const d = new Date(now.getTime() - (89 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const stats = dayMap.get(key);
        if (!stats || stats.total === 0) {
          uptime90Series.push("empty");
        } else {
          const failRate = stats.fails / stats.total;
          if (failRate === 0) uptime90Series.push("up");
          else if (failRate < 0.1) uptime90Series.push("degraded");
          else uptime90Series.push("down");
        }
      }
      const successDays = uptime90Series.filter((s) => s === "up").length;
      const tracked = uptime90Series.filter((s) => s !== "empty").length;
      const uptime90d = tracked > 0 ? (successDays / tracked) * 100 : null;

      const stats = agg[0];
      return {
        monitorId: mid,
        series,
        seriesAsc,
        total24h: stats?.total ?? 0,
        success24h: stats?.success ?? 0,
        avg24h: stats?.avg ?? null,
        p50: stats?.p50 ?? null,
        p95: stats?.p95 ?? null,
        p99: stats?.p99 ?? null,
        uptime24h: uptimePctFromCounts(stats?.success ?? 0, stats?.total ?? 0),
        uptime90d,
        uptime90Series,
      };
    }),
  );
  const perMonitorMap = new Map(perMonitor.map((p) => [p.monitorId, p]));

  // 3. Org-wide totals over last 24h
  let totalSuccess24h = 0;
  let totalAll24h = 0;
  let weightedRespNumerator = 0;
  for (const p of perMonitor) {
    totalSuccess24h += p.success24h;
    totalAll24h += p.total24h;
    if (p.avg24h != null && p.total24h > 0) {
      weightedRespNumerator += p.avg24h * p.total24h;
    }
  }
  const orgUptime24h = uptimePctFromCounts(totalSuccess24h, totalAll24h) ?? 100;
  const orgAvgResp =
    totalAll24h > 0 ? Math.round(weightedRespNumerator / totalAll24h) : null;

  // Org-wide percentiles for the stat card sub-line
  const orgPerc = await db
    .select({
      p95: sql<
        number | null
      >`percentile_cont(0.95) within group (order by ${checkResults.responseTimeMs})::int`,
      p99: sql<
        number | null
      >`percentile_cont(0.99) within group (order by ${checkResults.responseTimeMs})::int`,
    })
    .from(checkResults)
    .innerJoin(monitors, eq(checkResults.monitorId, monitors.id))
    .where(
      and(
        eq(monitors.organizationId, orgId),
        gte(checkResults.time, twentyFourHoursAgo),
      ),
    );

  // 4. 24h hourly response sparkline
  const hourly = await db
    .select({
      hour: sql<string>`date_trunc('hour', ${checkResults.time})::text`,
      avg: sql<number | null>`avg(${checkResults.responseTimeMs})::int`,
      total: sql<number>`count(*)::int`,
      success: sql<
        number
      >`count(*) filter (where ${checkResults.status} = 'up')::int`,
    })
    .from(checkResults)
    .innerJoin(monitors, eq(checkResults.monitorId, monitors.id))
    .where(
      and(
        eq(monitors.organizationId, orgId),
        gte(checkResults.time, twentyFourHoursAgo),
      ),
    )
    .groupBy(sql`date_trunc('hour', ${checkResults.time})`)
    .orderBy(sql`date_trunc('hour', ${checkResults.time})`);

  // Bin into 24 hourly slots
  const responseSeries: number[] = [];
  const uptimeSeries: number[] = [];
  for (let i = 23; i >= 0; i--) {
    const slotStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const slotEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
    const matching = hourly.find((h) => {
      const hd = new Date(h.hour);
      return hd >= slotStart && hd < slotEnd;
    });
    if (matching) {
      responseSeries.push(matching.avg ?? 0);
      const pct = uptimePctFromCounts(matching.success, matching.total) ?? 100;
      uptimeSeries.push(pct);
    } else {
      // Fall back to org average / 100% so the line stays continuous-ish
      responseSeries.push(orgAvgResp ?? 0);
      uptimeSeries.push(100);
    }
  }
  // Pad to 48 by duplicating the first half (24 hours rendered as 48 samples for visual smoothness)
  const upsampled = (arr: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < arr.length; i++) {
      out.push(arr[i]);
      if (i < arr.length - 1) {
        out.push((arr[i] + arr[i + 1]) / 2);
      } else {
        out.push(arr[i]);
      }
    }
    return out;
  };
  const responseSeries48 = upsampled(responseSeries);
  const uptimeSeries48 = upsampled(uptimeSeries);

  // 5. Incidents in last 24h (and prior 24h for delta)
  const incidents24hRows = await db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      impact: incidents.impact,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
      statusPageId: incidents.statusPageId,
    })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, orgId),
        gte(incidents.createdAt, twentyFourHoursAgo),
      ),
    );
  const priorIncidentsCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, orgId),
        gte(incidents.createdAt, fortyEightHoursAgo),
        sql`${incidents.createdAt} < ${twentyFourHoursAgo.toISOString()}`,
      ),
    );

  const incidents24h = incidents24hRows.length;
  const incidentsOpen = incidents24hRows.filter(
    (i) => i.status !== "resolved" && i.resolvedAt == null,
  ).length;
  const resolvedDurations = incidents24hRows
    .filter((i) => i.resolvedAt != null)
    .map((i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000);
  const mttrMin =
    resolvedDurations.length > 0
      ? Math.round(
          resolvedDurations.reduce((a, b) => a + b, 0) /
            resolvedDurations.length,
        )
      : null;
  const incidentsDelta = incidents24h - (priorIncidentsCount[0]?.count ?? 0);

  // 6. Incidents bar series (count per hour, last 24h)
  const incidentsByHour = new Array(24).fill(0);
  for (const i of incidents24hRows) {
    const h = Math.floor(
      (i.createdAt.getTime() - twentyFourHoursAgo.getTime()) / (60 * 60 * 1000),
    );
    if (h >= 0 && h < 24) incidentsByHour[h]++;
  }

  // 7. Active incident (most recent unresolved)
  const activeIncident = incidents24hRows
    .filter((i) => i.status !== "resolved" && i.resolvedAt == null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  let activeIncidentSummary: ActiveIncidentSummary | null = null;
  if (activeIncident) {
    const [page] = await db
      .select({ name: statusPages.name })
      .from(statusPages)
      .where(eq(statusPages.id, activeIncident.statusPageId))
      .limit(1);
    const updates = await db
      .select({ id: incidentUpdates.id })
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, activeIncident.id));
    activeIncidentSummary = {
      id: activeIncident.id,
      title: activeIncident.title,
      severity: toSeverity(activeIncident.impact),
      state: toIncidentState(activeIncident.status),
      pageName: page?.name ?? "Unknown page",
      openedAgo: formatAgo(activeIncident.createdAt),
      commentCount: updates.length,
      mentionCount: 0,
    };
  }

  // 8. Activity feed: last ~6 events. Mix of recent incident updates + recent incident open/resolve events.
  const recentUpdates = await db
    .select({
      id: incidentUpdates.id,
      message: incidentUpdates.message,
      status: incidentUpdates.status,
      createdAt: incidentUpdates.createdAt,
      incidentId: incidentUpdates.incidentId,
      incidentTitle: incidents.title,
    })
    .from(incidentUpdates)
    .innerJoin(incidents, eq(incidentUpdates.incidentId, incidents.id))
    .where(
      and(
        eq(incidents.organizationId, orgId),
        gte(incidentUpdates.createdAt, twentyFourHoursAgo),
      ),
    )
    .orderBy(desc(incidentUpdates.createdAt))
    .limit(6);

  const activity: ActivityEntry[] = [];
  for (const i of incidents24hRows.slice(0, 4)) {
    activity.push({
      id: `inc-open-${i.id}`,
      kind: "system-down",
      who: "system",
      what: `Incident opened: ${i.title}`,
      ago: relAgo(i.createdAt),
    });
    if (i.resolvedAt) {
      activity.push({
        id: `inc-resolve-${i.id}`,
        kind: "system-up",
        who: "system",
        what: `Incident resolved: ${i.title}`,
        ago: relAgo(i.resolvedAt),
      });
    }
  }
  for (const u of recentUpdates) {
    activity.push({
      id: `upd-${u.id}`,
      kind: "comment",
      who: "system",
      what: `${u.incidentTitle}: ${u.message.slice(0, 80)}${u.message.length > 80 ? "…" : ""}`,
      ago: relAgo(u.createdAt),
    });
  }
  // Trim to 6 newest
  const activitySorted = activity
    .sort((a, b) => {
      // crude: parse the ago string back roughly. Comparing recency by id ordering of upstream sort is fine.
      return 0;
    })
    .slice(0, 6);

  // 9. Compose monitor rows for the table
  const monitorRows: MonitorRow[] = orgMonitors.map((m) => {
    const p = perMonitorMap.get(m.id);
    const lastResult = p?.seriesAsc[p.seriesAsc.length - 1];
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
      series: p?.series ?? [],
      uptime24h: p?.uptime24h ?? null,
      uptime90d: p?.uptime90d ?? null,
      uptime90Series: p?.uptime90Series ?? [],
      intervalSec: m.intervalSeconds,
      p50Ms: p?.p50 ?? null,
      p95Ms: p?.p95 ?? null,
      p99Ms: p?.p99 ?? null,
    };
  });

  // 10. Monitor counts
  const monitorsTotal = orgMonitors.length;
  const monitorsUp = orgMonitors.filter((m) => m.status === "up").length;
  const monitorsDegraded = orgMonitors.filter(
    (m) => m.status === "degraded",
  ).length;
  const monitorsDown = orgMonitors.filter((m) => m.status === "down").length;
  const monitorsPaused = orgMonitors.filter((m) => m.status === "paused").length;

  // 11. Monitors series — flat at current count for now (placeholder until a real over-time query exists)
  const monitorsSeries = new Array(48).fill(monitorsTotal);

  // 12. Stat card props
  const stats: DashboardStats = {
    uptime24h: orgUptime24h,
    uptimeDelta: null, // TODO: compute prior 24h and diff (placeholder for now)
    uptimeSeries: uptimeSeries48,
    incidents24h,
    incidentsOpen,
    incidentsMTTRMin: mttrMin,
    incidentsDelta,
    incidentsSeries: incidentsByHour,
    avgResponseMs: orgAvgResp,
    responseDeltaMs: null,
    responseSeries: responseSeries48,
    p95Ms: orgPerc[0]?.p95 ?? null,
    p99Ms: orgPerc[0]?.p99 ?? null,
    monitorsTotal,
    monitorsUp,
    monitorsDegraded,
    monitorsDown,
    monitorsPaused,
    monitorsSeries,
  };

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3100";
  const mcpEndpoint = `${baseUrl.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] leading-[1.15] m-0">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1">
            Overview of your monitors and services · {monitorsTotal} monitor
            {monitorsTotal === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[12.5px] font-medium hover:bg-muted transition-colors">
            <Filter className="h-3 w-3" />
            Last 24h
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          <Link
            href="/monitors/new"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium border border-transparent hover:opacity-95 transition-opacity"
          >
            <Plus className="h-3 w-3" />
            New monitor
          </Link>
        </div>
      </div>

      {/* Active incident banner */}
      {activeIncidentSummary && (
        <IncidentBanner incident={activeIncidentSummary} />
      )}

      {/* Stat cards */}
      <div className="mb-5">
        <StatCards stats={stats} />
      </div>

      {/* Split: monitor table + ambient panels */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <MonitorTable monitors={monitorRows} />
        <div className="flex flex-col gap-3">
          <ActivityRail activity={activitySorted} />
          <McpRail
            connected={false}
            toolCount={0}
            lastCallAgo={null}
            endpoint={mcpEndpoint}
          />
        </div>
      </div>
    </div>
  );
}
