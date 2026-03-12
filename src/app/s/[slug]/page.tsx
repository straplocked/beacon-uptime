import { db } from "@/lib/db";
import {
  statusPages,
  statusPageMonitors,
  monitors,
  checkResults,
  incidents,
  incidentUpdates,
} from "@/lib/db/schema";
import { eq, and, desc, gte, isNull, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { UptimeBar } from "@/components/status-page/uptime-bar";
import { ComponentRow } from "@/components/status-page/component-row";
import { IncidentCard } from "@/components/status-page/incident-card";
import { SubscribeButton } from "@/components/status-page/subscribe-button";
import { StatusPageFooter } from "@/components/status-page/footer";
import type { FooterConfig } from "@/lib/types/footer";
import type { DisplayStyle } from "@/lib/types/footer";
import {
  getThemeCSS,
  getThemeWrapperClass,
  isLightTheme,
  type StatusTheme,
} from "@/lib/status-themes";

async function getStatusPage(slug: string) {
  let [page] = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.slug, slug))
    .limit(1);

  if (!page) return null;
  if (!page.isPublic) return null;

  return page;
}

async function getStatusPageByDomain(domain: string) {
  const [page] = await db
    .select()
    .from(statusPages)
    .where(eq(statusPages.customDomain, domain))
    .limit(1);

  return page?.isPublic ? page : null;
}

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const headerList = await headers();
  const host = headerList.get("host") || "";
  let page = null;

  if (
    !host.includes("pluginsynthesis.com") &&
    !host.includes("localhost")
  ) {
    page = await getStatusPageByDomain(host);
  }

  if (!page) {
    page = await getStatusPage(slug);
  }

  if (!page) notFound();

  const theme = (page.theme || "midnight") as StatusTheme;
  const themeCSS = getThemeCSS(theme);
  const wrapperClass = getThemeWrapperClass(theme);
  const light = isLightTheme(theme);

  // Get linked monitors with their status
  const linkedMonitors = await db
    .select({
      spm: statusPageMonitors,
      monitor: monitors,
    })
    .from(statusPageMonitors)
    .innerJoin(monitors, eq(statusPageMonitors.monitorId, monitors.id))
    .where(eq(statusPageMonitors.statusPageId, page.id))
    .orderBy(statusPageMonitors.sortOrder);

  const days = page.showHistoryDays;
  const monitorData = await Promise.all(
    linkedMonitors.map(async ({ spm, monitor }) => {
      const dailyStats = await db.execute(sql`
        SELECT
          time_bucket('1 day', time) AS day,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'up') AS up_count,
          ROUND(AVG(response_time_ms)) AS avg_response
        FROM check_results
        WHERE monitor_id = ${monitor.id}
          AND time > NOW() - ${days + ' days'}::interval
        GROUP BY day
        ORDER BY day ASC
      `);

      const overallStats = await db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'up') AS up_count,
          ROUND(AVG(response_time_ms)) AS avg_response,
          MIN(response_time_ms) AS min_response,
          MAX(response_time_ms) AS max_response
        FROM check_results
        WHERE monitor_id = ${monitor.id}
          AND time > NOW() - ${days + ' days'}::interval
      `);

      const recentChecks = await db
        .select()
        .from(checkResults)
        .where(eq(checkResults.monitorId, monitor.id))
        .orderBy(desc(checkResults.time))
        .limit(20);

      const overall = overallStats[0] as any;
      const uptimePercent =
        overall?.total > 0
          ? ((Number(overall.up_count) / Number(overall.total)) * 100).toFixed(2)
          : null;

      return {
        id: monitor.id,
        name: spm.displayName || monitor.name,
        target: monitor.target,
        type: monitor.type,
        group: spm.groupName,
        displayStyle: (spm.displayStyle || "bars") as DisplayStyle,
        status: monitor.status,
        intervalSeconds: monitor.intervalSeconds,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() || null,
        uptimePercent,
        avgResponse: overall?.avg_response ? Number(overall.avg_response) : null,
        minResponse: overall?.min_response ? Number(overall.min_response) : null,
        maxResponse: overall?.max_response ? Number(overall.max_response) : null,
        dailyStats: (dailyStats as any[]).map((d) => ({
          day: d.day,
          total: Number(d.total),
          upCount: Number(d.up_count),
          avgResponse: d.avg_response ? Number(d.avg_response) : null,
        })),
        recentChecks: recentChecks.map((c) => ({
          time: c.time.toISOString(),
          status: c.status,
          responseTimeMs: c.responseTimeMs,
          statusCode: c.statusCode,
          region: c.region,
        })),
      };
    })
  );

  const recentIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.statusPageId, page.id))
    .orderBy(desc(incidents.createdAt))
    .limit(10);

  const incidentData = await Promise.all(
    recentIncidents.map(async (incident) => {
      const updates = await db
        .select()
        .from(incidentUpdates)
        .where(eq(incidentUpdates.incidentId, incident.id))
        .orderBy(desc(incidentUpdates.createdAt));

      return { ...incident, updates };
    })
  );

  const hasDown = monitorData.some((m) => m.status === "down");
  const hasDegraded = monitorData.some((m) => m.status === "degraded");
  const overallStatus = hasDown
    ? "major_outage"
    : hasDegraded
      ? "degraded"
      : "operational";

  const overallStatusText: Record<string, string> = {
    operational: page.headerText || "All Systems Operational",
    degraded: "Some Systems Experiencing Issues",
    major_outage: "Major System Outage",
  };

  function bannerStyle(s: string) {
    switch (s) {
      case "operational": return { borderColor: "var(--sp-accent-border)", background: "var(--sp-accent-subtle)", color: "var(--sp-accent)" };
      case "degraded": return { borderColor: "var(--sp-warning-border)", background: "var(--sp-warning-subtle)", color: "var(--sp-warning)" };
      case "major_outage": return { borderColor: "var(--sp-danger-border)", background: "var(--sp-danger-subtle)", color: "var(--sp-danger)" };
      default: return { borderColor: "var(--sp-border)", background: "var(--sp-surface)", color: "var(--sp-text)" };
    }
  }

  function pulseClass(s: string) {
    switch (s) {
      case "operational": return "status-pulse-accent";
      case "degraded": return "status-pulse-warning";
      case "major_outage": return "status-pulse-danger";
      default: return "";
    }
  }

  // Group monitors
  const groups = new Map<string, typeof monitorData>();
  for (const mon of monitorData) {
    const group = mon.group || "Services";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(mon);
  }

  const banner = bannerStyle(overallStatus);

  return (
    <div
      className={wrapperClass}
      data-sp-theme={theme}
      style={{
        background: "var(--sp-bg)",
        color: "var(--sp-text)",
        fontFamily: "var(--sp-font)",
      } as React.CSSProperties}
    >
      <style>{`[data-sp-theme="${theme}"]{${themeCSS}}`}</style>
      {page.customCss && <style>{page.customCss}</style>}

      {/* Ambient glow orbs (hidden on light themes) */}
      {!light && (
        <>
          <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <div
              className="absolute w-[600px] h-[600px] rounded-full -top-[15%] -right-[10%]"
              style={{ background: "var(--sp-glow-1)", filter: "blur(100px)" }}
            />
            <div
              className="absolute w-[500px] h-[500px] rounded-full -bottom-[10%] -left-[8%]"
              style={{ background: "var(--sp-glow-2)", filter: "blur(100px)" }}
            />
          </div>
          <div
            className="fixed inset-0 opacity-[0.015] pointer-events-none z-[1]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
          />
        </>
      )}

      {/* Terminal scanlines */}
      {theme === "terminal" && (
        <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.03]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
          }}
        />
      )}

      <div className="relative z-[2] max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            {page.logoUrl && (
              <img src={page.logoUrl} alt="" className="h-8" />
            )}
            <h1
              className="text-xl tracking-wide uppercase"
              style={{ color: "var(--sp-text)", fontFamily: theme === "terminal" ? "var(--sp-mono)" : "var(--font-space-grotesk, 'Space Grotesk'), sans-serif", fontWeight: 700 }}
            >
              {page.name}
            </h1>
          </div>
          <SubscribeButton slug={page.slug} />
        </div>

        {/* Overall status banner */}
        <div
          className="relative rounded-xl p-5 mb-10 backdrop-blur-sm"
          style={{ background: banner.background, border: `1px solid ${banner.borderColor}` }}
        >
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${pulseClass(overallStatus)}`}
              style={{ background: banner.color }}
            />
            <p className="font-semibold text-lg" style={{ color: banner.color }}>
              {overallStatusText[overallStatus]}
            </p>
          </div>
        </div>

        {/* Components by group */}
        {Array.from(groups.entries()).map(([groupName, groupMonitors]) => (
          <div key={groupName} className="mb-10">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3 pl-1"
              style={{ color: "var(--sp-text-3)" }}
            >
              {groupName}
            </h2>
            <div
              className="rounded-xl backdrop-blur-sm"
              style={{ background: "var(--sp-surface)", border: `1px solid var(--sp-border)` }}
            >
              {groupMonitors.map((mon, i) => (
                <div key={mon.id}>
                  {i > 0 && <div style={{ borderTop: `1px solid var(--sp-divider)` }} />}
                  <ComponentRow
                    name={mon.name}
                    target={mon.target}
                    type={mon.type}
                    status={mon.status}
                    uptimePercent={mon.uptimePercent}
                    avgResponse={mon.avgResponse}
                    minResponse={mon.minResponse}
                    maxResponse={mon.maxResponse}
                    intervalSeconds={mon.intervalSeconds}
                    lastCheckedAt={mon.lastCheckedAt}
                    dailyStats={mon.dailyStats}
                    recentChecks={mon.recentChecks}
                    showUptime={page.showUptimePercentage}
                    showResponseTime={page.showResponseTime}
                    days={page.showHistoryDays}
                    displayStyle={mon.displayStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Incidents */}
        <div className="mt-16">
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-4 pl-1"
            style={{ color: "var(--sp-text-3)" }}
          >
            Past Incidents
          </h2>
          {incidentData.length === 0 ? (
            <p className="text-sm pl-1" style={{ color: "var(--sp-text-3)" }}>
              No incidents reported.
            </p>
          ) : (
            <div className="space-y-3">
              {incidentData.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  title={incident.title}
                  status={incident.status}
                  impact={incident.impact}
                  createdAt={incident.createdAt.toISOString()}
                  resolvedAt={incident.resolvedAt?.toISOString() || null}
                  updates={incident.updates.map((u) => ({
                    status: u.status,
                    message: u.message,
                    createdAt: u.createdAt.toISOString(),
                  }))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <StatusPageFooter
          slug={page.slug}
          footerText={page.footerText}
          footerConfig={(page as any).footerConfig as FooterConfig | null}
        />
      </div>
    </div>
  );
}
