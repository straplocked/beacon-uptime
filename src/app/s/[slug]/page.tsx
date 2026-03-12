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

async function getStatusPage(slug: string) {
  // First try slug, then check if it's a custom domain
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

  // Check for custom domain first
  const headerList = await headers();
  const host = headerList.get("host") || "";
  let page = null;

  // If the host looks like a custom domain (not our main domain)
  if (
    !host.includes("pluginsynthesis.com") &&
    !host.includes("localhost")
  ) {
    page = await getStatusPageByDomain(host);
  }

  // Fall back to slug-based lookup
  if (!page) {
    page = await getStatusPage(slug);
  }

  if (!page) notFound();

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

  // Get daily uptime data for each monitor (last N days)
  const days = page.showHistoryDays;
  const monitorData = await Promise.all(
    linkedMonitors.map(async ({ spm, monitor }) => {
      // Get daily stats
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

      // Overall uptime
      const overallStats = await db.execute(sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'up') AS up_count
        FROM check_results
        WHERE monitor_id = ${monitor.id}
          AND time > NOW() - ${days + ' days'}::interval
      `);

      const overall = overallStats[0] as any;
      const uptimePercent =
        overall?.total > 0
          ? ((Number(overall.up_count) / Number(overall.total)) * 100).toFixed(
              2
            )
          : null;

      return {
        id: monitor.id,
        name: spm.displayName || monitor.name,
        target: monitor.target,
        group: spm.groupName,
        status: monitor.status,
        uptimePercent,
        dailyStats: (dailyStats as any[]).map((d) => ({
          day: d.day,
          total: Number(d.total),
          upCount: Number(d.up_count),
          avgResponse: d.avg_response ? Number(d.avg_response) : null,
        })),
      };
    })
  );

  // Get recent incidents
  const recentIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.statusPageId, page.id))
    .orderBy(desc(incidents.createdAt))
    .limit(10);

  // Get updates for each incident
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

  // Determine overall status
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

  const overallStatusColor: Record<string, string> = {
    operational: "bg-teal-500",
    degraded: "bg-amber-500",
    major_outage: "bg-red-500",
  };

  // Group monitors
  const groups = new Map<string, typeof monitorData>();
  for (const mon of monitorData) {
    const group = mon.group || "Services";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(mon);
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{ "--brand-color": page.brandColor } as React.CSSProperties}
    >
      {page.customCss && <style>{page.customCss}</style>}

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {page.logoUrl && (
              <img src={page.logoUrl} alt="" className="h-8" />
            )}
            <h1 className="text-xl font-bold text-foreground">{page.name}</h1>
          </div>
          <SubscribeButton slug={page.slug} />
        </div>

        {/* Overall status */}
        <div
          className={`rounded-lg p-4 mb-8 text-white ${overallStatusColor[overallStatus]}`}
        >
          <p className="font-semibold text-lg">
            {overallStatusText[overallStatus]}
          </p>
        </div>

        {/* Components by group */}
        {Array.from(groups.entries()).map(([groupName, groupMonitors]) => (
          <div key={groupName} className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {groupName}
            </h2>
            <div className="bg-card rounded-lg border divide-y">
              {groupMonitors.map((mon) => (
                <ComponentRow
                  key={mon.id}
                  name={mon.name}
                  target={mon.target}
                  status={mon.status}
                  uptimePercent={mon.uptimePercent}
                  dailyStats={mon.dailyStats}
                  showUptime={page.showUptimePercentage}
                  showResponseTime={page.showResponseTime}
                  days={page.showHistoryDays}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Incidents */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Past Incidents
          </h2>
          {incidentData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No incidents reported.</p>
          ) : (
            <div className="space-y-4">
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
        <div className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          {page.footerText && (
            <p className="mb-2">{page.footerText}</p>
          )}
          <div className="flex items-center justify-center gap-4">
            <a
              href={`/s/${page.slug}/rss`}
              className="text-muted-foreground hover:text-foreground"
              title="RSS Feed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
              </svg>
            </a>
            <p>
              Powered by{" "}
              <a
                href="https://beacon.pluginsynthesis.com"
                className="text-muted-foreground hover:text-foreground"
              >
                Beacon
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
