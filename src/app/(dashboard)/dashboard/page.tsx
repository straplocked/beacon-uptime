import { db } from "@/lib/db";
import { monitors, checkResults, incidents } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, and, desc, sql, isNull, ne, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowUp, ArrowDown, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  // Fetch monitors
  const userMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.organizationId, ctx.organization.id))
    .orderBy(desc(monitors.createdAt));

  // Count by status
  const upCount = userMonitors.filter((m) => m.status === "up").length;
  const downCount = userMonitors.filter((m) => m.status === "down").length;
  const degradedCount = userMonitors.filter((m) => m.status === "degraded").length;
  const pausedCount = userMonitors.filter((m) => m.status === "paused").length;

  // Active incidents count
  const [activeIncidentCount] = await db
    .select({ count: count() })
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, ctx.organization.id),
        isNull(incidents.resolvedAt),
        ne(incidents.status, "resolved")
      )
    );

  const statusIcon = (status: string) => {
    switch (status) {
      case "up":
        return <span className="h-2.5 w-2.5 rounded-full bg-teal-500 inline-block animate-pulse-dot" />;
      case "down":
        return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />;
      case "degraded":
        return <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />;
      case "paused":
        return <span className="h-2.5 w-2.5 rounded-full bg-slate-400 inline-block" />;
      default:
        return <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your monitors and services
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monitors Up
            </CardTitle>
            <ArrowUp className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upCount}</div>
            <p className="text-xs text-muted-foreground">
              of {userMonitors.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monitors Down
            </CardTitle>
            <ArrowDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{downCount}</div>
            {degradedCount > 0 && (
              <p className="text-xs text-amber-600">
                {degradedCount} degraded
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Incidents
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeIncidentCount.count}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paused
            </CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pausedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Monitor list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Monitors</CardTitle>
          <Link href="/monitors/new">
            <Badge variant="secondary" className="cursor-pointer hover:bg-muted">
              + Add Monitor
            </Badge>
          </Link>
        </CardHeader>
        <CardContent>
          {userMonitors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No monitors yet</p>
              <p className="text-sm mt-1">
                <Link href="/monitors/new" className="text-primary hover:underline">
                  Create your first monitor
                </Link>{" "}
                to start tracking uptime.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {userMonitors.map((monitor) => (
                <Link
                  key={monitor.id}
                  href={`/monitors/${monitor.id}`}
                  className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-4 px-4 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {statusIcon(monitor.status)}
                    <div>
                      <p className="font-medium text-sm">{monitor.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {monitor.target}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {monitor.type.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                      {monitor.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
