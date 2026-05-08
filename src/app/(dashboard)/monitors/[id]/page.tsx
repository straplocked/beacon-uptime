/**
 * P-MON-DETAIL — Monitor detail page.
 *
 * Visual spec: docs/design/handoff-2026-q2.md §12 (P-MON-DETAIL).
 * Replaces the previous shadcn-default layout with a Linear-tight redesign:
 * breadcrumb, editable name, 6-stat row, token-driven chart with optional
 * incident-band overlays, expandable check history, right rail with related
 * incidents / notification channels / monitor config.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  Bell,
  ChevronRight,
  Clock,
  Cpu,
  Globe,
  Pause,
  Play,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckHistory } from "@/components/monitors/check-history";
import { EditableName } from "@/components/monitors/editable-name";
import { MonitorActions } from "@/components/monitors/monitor-actions";
import {
  ResponseChart,
  type IncidentBand,
} from "@/components/monitors/response-chart";
import {
  IncidentStatePill,
  SeverityPill,
  StatusPill,
  StatusDot,
  TypePill,
  type IncidentSeverity,
  type IncidentState,
  type MonitorStatus,
} from "@/components/dashboard/status-indicators";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checkResults,
  incidents,
  monitors,
  notificationChannels,
  statusPageMonitors,
  statusPages,
} from "@/lib/db/schema";

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

function relAgo(date: Date | null | undefined): string {
  if (!date) return "never";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default async function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const { id } = await params;

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(
      and(
        eq(monitors.id, id),
        eq(monitors.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);

  if (!monitor) notFound();

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Recent checks (60 oldest→newest for the chart)
  const recentChecks = await db
    .select()
    .from(checkResults)
    .where(eq(checkResults.monitorId, id))
    .orderBy(desc(checkResults.time))
    .limit(60);
  const recentAsc = recentChecks.slice().reverse();

  // 24h aggregates + percentiles
  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<
        number
      >`count(*) filter (where ${checkResults.status} = 'up')::int`,
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
        eq(checkResults.monitorId, id),
        gte(checkResults.time, twentyFourHoursAgo),
      ),
    );

  const uptime24h =
    agg && agg.total > 0 ? (agg.success / agg.total) * 100 : null;

  // Find status pages this monitor is on (for related incidents).
  const linkedPages = await db
    .select({ statusPageId: statusPageMonitors.statusPageId })
    .from(statusPageMonitors)
    .where(eq(statusPageMonitors.monitorId, id));
  const linkedPageIds = linkedPages.map((p) => p.statusPageId);

  // Related incidents — last 14 days, on linked status pages
  const relatedIncidents =
    linkedPageIds.length > 0
      ? await db
          .select({
            id: incidents.id,
            title: incidents.title,
            status: incidents.status,
            impact: incidents.impact,
            createdAt: incidents.createdAt,
            resolvedAt: incidents.resolvedAt,
          })
          .from(incidents)
          .where(
            and(
              eq(incidents.organizationId, ctx.organization.id),
              inArray(incidents.statusPageId, linkedPageIds),
              gte(incidents.createdAt, fourteenDaysAgo),
            ),
          )
          .orderBy(desc(incidents.createdAt))
          .limit(5)
      : [];

  // Org notification channels (per-monitor routing isn't modeled yet)
  const channels = await db
    .select({
      id: notificationChannels.id,
      name: notificationChannels.name,
      type: notificationChannels.type,
      isDefault: notificationChannels.isDefault,
    })
    .from(notificationChannels)
    .where(eq(notificationChannels.organizationId, ctx.organization.id))
    .limit(8);

  // Compute incident bands for the chart from related incidents that overlap recent checks.
  const bands: IncidentBand[] = [];
  if (recentAsc.length > 0 && relatedIncidents.length > 0) {
    const firstTime = recentAsc[0].time.getTime();
    const lastTime = recentAsc[recentAsc.length - 1].time.getTime();
    const span = Math.max(1, lastTime - firstTime);
    for (const inc of relatedIncidents) {
      const start = inc.createdAt.getTime();
      const end = inc.resolvedAt ? inc.resolvedAt.getTime() : lastTime;
      // Skip incidents fully outside the visible window.
      if (end < firstTime || start > lastTime) continue;
      const fromIndex = Math.max(
        0,
        Math.round(((start - firstTime) / span) * (recentAsc.length - 1)),
      );
      const toIndex = Math.min(
        recentAsc.length - 1,
        Math.round(((end - firstTime) / span) * (recentAsc.length - 1)),
      );
      bands.push({
        fromIndex,
        toIndex,
        severity:
          inc.impact === "critical" ||
          inc.impact === "major" ||
          inc.impact === "minor"
            ? inc.impact
            : "minor",
      });
    }
  }

  const chartData = recentAsc.map((c) => ({
    time: new Date(c.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    responseTime: c.responseTimeMs ?? 0,
    status: (c.status === "up" || c.status === "degraded" || c.status === "down"
      ? c.status
      : "up") as "up" | "degraded" | "down",
  }));

  const status = toMonitorStatus(monitor.status);

  return (
    <div className="px-6 lg:px-6 py-5 pb-16 max-w-[1380px] mx-auto w-full">
      {/* Header — breadcrumb */}
      <nav
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-3"
        aria-label="Breadcrumb"
      >
        <Link
          href="/monitors"
          className="hover:text-foreground transition-colors"
        >
          Monitors
        </Link>
        <ChevronRight className="h-3 w-3 opacity-50" />
        <span className="text-foreground font-medium">{monitor.name}</span>
      </nav>

      {/* Header — title row */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <StatusDot status={status} pulse={status === "up"} size={10} />
          <EditableName monitorId={monitor.id} initialName={monitor.name} />
          <TypePill type={monitor.type.toUpperCase()} />
          <StatusPill status={status} />
          <span className="text-muted-foreground font-mono text-[12px]">
            {monitor.target}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MonitorActions
            monitorId={monitor.id}
            isPaused={monitor.isPaused}
          />
        </div>
      </div>

      {/* 6-stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <Stat label="Status" valueNode={
          <span
            className="font-semibold capitalize"
            style={{
              color:
                status === "up"
                  ? "var(--status-up)"
                  : status === "degraded"
                    ? "var(--status-degraded)"
                    : status === "down"
                      ? "var(--status-down)"
                      : "var(--muted-foreground)",
            }}
          >
            {status}
          </span>
        } />
        <Stat
          label="24h uptime"
          value={uptime24h != null ? `${uptime24h.toFixed(2)}%` : "—"}
        />
        <Stat label="p50" value={agg?.p50 != null ? `${agg.p50}ms` : "—"} />
        <Stat label="p95" value={agg?.p95 != null ? `${agg.p95}ms` : "—"} />
        <Stat label="p99" value={agg?.p99 != null ? `${agg.p99}ms` : "—"} />
        <Stat
          label="Last check"
          value={relAgo(monitor.lastCheckedAt ?? null)}
        />
      </div>

      {/* Split: chart + history (left) / right rail (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Response chart */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
                Response time
              </h2>
              <span className="text-muted-foreground text-[11.5px]">
                · last {recentAsc.length} checks
              </span>
              {bands.length > 0 && (
                <span
                  className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className="rounded-sm"
                    style={{
                      width: 10,
                      height: 10,
                      background: "var(--severity-major)",
                      opacity: 0.5,
                    }}
                  />
                  Incident window{bands.length > 1 ? "s" : ""}
                </span>
              )}
            </header>
            <div className="px-3 py-3">
              {chartData.length > 0 ? (
                <ResponseChart data={chartData} bands={bands} />
              ) : (
                <p className="text-muted-foreground text-center py-12 text-[13px]">
                  No check data yet. Checks will appear once the monitor starts running.
                </p>
              )}
            </div>
          </section>

          {/* Recent checks */}
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <h2 className="text-[13px] font-semibold m-0 tracking-[-0.005em]">
                Recent checks
              </h2>
              <span className="text-muted-foreground text-[11.5px]">
                · last {recentChecks.length}
              </span>
            </header>
            <CheckHistory
              checks={recentChecks.map((c) => ({
                time: c.time.toISOString(),
                status: c.status,
                responseTimeMs: c.responseTimeMs,
                statusCode: c.statusCode,
                errorMessage: c.errorMessage,
                region: c.region,
              }))}
            />
          </section>
        </div>

        {/* Right rail */}
        <aside className="flex flex-col gap-3 min-w-0">
          <RailCard title="Related incidents" subtitle="last 14d">
            {relatedIncidents.length === 0 ? (
              <EmptyRail message="No incidents in the last 14 days." />
            ) : (
              relatedIncidents.map((inc) => {
                const isOpen = inc.status !== "resolved" && !inc.resolvedAt;
                return (
                  <Link
                    key={inc.id}
                    href={`/incidents/${inc.id}`}
                    className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 border-b border-border last:border-b-0 hover:bg-muted/40 -mx-3 px-3 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[13px] font-medium text-foreground line-clamp-2 flex-1">
                        {inc.title}
                      </span>
                      <span className="text-[10.5px] font-mono text-muted-foreground shrink-0">
                        {relAgo(inc.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SeverityPill severity={toSeverity(inc.impact)} />
                      <IncidentStatePill state={toIncidentState(inc.status)} />
                      {!isOpen && inc.resolvedAt && (
                        <span className="text-[10.5px] text-muted-foreground">
                          resolved {relAgo(inc.resolvedAt)}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </RailCard>

          <RailCard title="Notification channels" subtitle={`${channels.length}`}>
            {channels.length === 0 ? (
              <EmptyRail
                message="No channels configured."
                cta={{ label: "Add channel →", href: "/notifications" }}
              />
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0 text-[12px]"
                >
                  <Bell className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{ch.name}</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground font-mono uppercase">
                    {ch.type}
                  </span>
                  {ch.isDefault && (
                    <span
                      className="text-[10px] uppercase tracking-wider font-medium px-1.5 rounded"
                      style={{
                        background: "var(--status-up-soft)",
                        color: "var(--status-up)",
                      }}
                    >
                      default
                    </span>
                  )}
                </div>
              ))
            )}
          </RailCard>

          <RailCard title="Configuration">
            <ConfigRow
              icon={<Clock className="h-3 w-3" />}
              label="Interval"
              value={`${monitor.intervalSeconds}s`}
            />
            <ConfigRow
              icon={<Cpu className="h-3 w-3" />}
              label="Timeout"
              value={`${monitor.timeoutMs}ms`}
            />
            {monitor.method && (
              <ConfigRow
                icon={<Globe className="h-3 w-3" />}
                label="Method"
                value={monitor.method}
              />
            )}
            {monitor.expectedStatusCode != null && (
              <ConfigRow
                icon={<Globe className="h-3 w-3" />}
                label="Expect"
                value={`${monitor.expectedStatusCode}`}
              />
            )}
            <ConfigRow
              icon={<Globe className="h-3 w-3" />}
              label="Regions"
              value={monitor.regions.join(", ")}
            />
            <ConfigRow
              icon={monitor.isPaused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              label="State"
              value={monitor.isPaused ? "Paused" : "Active"}
            />
          </RailCard>
        </aside>
      </div>
    </div>
  );
}

/* ─── Small primitives ──────────────────────────── */

function Stat({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] font-semibold tabnum text-foreground leading-tight">
        {valueNode ?? value}
      </div>
    </div>
  );
}

function RailCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-lg p-3.5">
      <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[0.01em]">
        {title}
        {subtitle && (
          <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">
            {subtitle}
          </span>
        )}
      </h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function EmptyRail({
  message,
  cta,
}: {
  message: string;
  cta?: { label: string; href: string };
}) {
  return (
    <p className="text-[12px] text-muted-foreground py-1">
      {message}
      {cta && (
        <>
          {" "}
          <Link
            href={cta.href}
            className="text-primary hover:underline whitespace-nowrap"
          >
            {cta.label}
          </Link>
        </>
      )}
    </p>
  );
}

function ConfigRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 first:pt-0 last:pb-0 text-[12px]">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono tabnum text-[11.5px] text-foreground truncate">
        {value}
      </span>
    </div>
  );
}
