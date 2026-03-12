import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Activity } from "lucide-react";
import Link from "next/link";

export default async function MonitorsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const userMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, user.id))
    .orderBy(desc(monitors.createdAt));

  const statusColor: Record<string, string> = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    degraded: "bg-yellow-500",
    paused: "bg-zinc-400",
    pending: "bg-zinc-300",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitors</h1>
          <p className="text-muted-foreground">
            {userMonitors.length} monitor{userMonitors.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/monitors/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Monitor
          </Button>
        </Link>
      </div>

      {userMonitors.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-lg">No monitors yet</p>
            <p className="text-muted-foreground mt-1 mb-4">
              Start monitoring your first service
            </p>
            <Link href="/monitors/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Monitor
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {userMonitors.map((monitor) => (
            <Link key={monitor.id} href={`/monitors/${monitor.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <span
                      className={`h-3 w-3 rounded-full ${statusColor[monitor.status] || "bg-zinc-300"}`}
                    />
                    <div>
                      <p className="font-medium">{monitor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {monitor.target}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{monitor.type.toUpperCase()}</Badge>
                    <Badge
                      variant={monitor.status === "up" ? "default" : "destructive"}
                      className={
                        monitor.status === "up"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : monitor.status === "paused"
                            ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-100"
                            : undefined
                      }
                    >
                      {monitor.status.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Every {monitor.intervalSeconds}s
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
