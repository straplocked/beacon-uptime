import { db } from "@/lib/db";
import { monitors, checkResults } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Globe, Pause, Play, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { MonitorActions } from "@/components/monitors/monitor-actions";
import { ResponseChart } from "@/components/monitors/response-chart";
import { CheckHistory } from "@/components/monitors/check-history";

export default async function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  if (!monitor) notFound();

  // Recent checks
  const recentChecks = await db
    .select()
    .from(checkResults)
    .where(eq(checkResults.monitorId, id))
    .orderBy(desc(checkResults.time))
    .limit(50);

  // 24h stats
  const statsResult = await db.execute(sql`
    SELECT
      COUNT(*) AS total_checks,
      COUNT(*) FILTER (WHERE status = 'up') AS up_checks,
      ROUND(AVG(response_time_ms)) AS avg_response_time,
      MAX(response_time_ms) AS max_response_time,
      MIN(response_time_ms) AS min_response_time
    FROM check_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
  `);

  const stats = statsResult[0] as any;
  const uptimePercent =
    stats?.total_checks > 0
      ? ((Number(stats.up_checks) / Number(stats.total_checks)) * 100).toFixed(2)
      : "N/A";

  const statusColor: Record<string, string> = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    degraded: "bg-yellow-500",
    paused: "bg-zinc-400",
    pending: "bg-zinc-300",
  };

  const chartData = recentChecks
    .slice()
    .reverse()
    .map((check) => ({
      time: new Date(check.time).toLocaleTimeString(),
      responseTime: check.responseTimeMs || 0,
      status: check.status,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/monitors">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${statusColor[monitor.status] || "bg-zinc-300"}`}
              />
              <h1 className="text-2xl font-bold">{monitor.name}</h1>
              <Badge variant="outline">{monitor.type.toUpperCase()}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">{monitor.target}</p>
          </div>
        </div>
        <MonitorActions monitorId={monitor.id} isPaused={monitor.isPaused} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-xl font-bold capitalize">{monitor.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Uptime (24h)</p>
            <p className="text-xl font-bold">{uptimePercent}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Avg Response</p>
            <p className="text-xl font-bold">
              {stats?.avg_response_time ? `${stats.avg_response_time}ms` : "N/A"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Check Interval</p>
            <p className="text-xl font-bold">{monitor.intervalSeconds}s</p>
          </CardContent>
        </Card>
      </div>

      {/* Response time chart */}
      <Card>
        <CardHeader>
          <CardTitle>Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponseChart data={chartData} />
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No check data yet. Checks will appear once the monitor starts running.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent checks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Checks</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
