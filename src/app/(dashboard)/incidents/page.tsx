import { db } from "@/lib/db";
import { incidents, statusPages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function IncidentsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const userIncidents = await db
    .select({
      incident: incidents,
      statusPage: statusPages,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(eq(incidents.userId, user.id))
    .orderBy(desc(incidents.createdAt));

  const impactColors: Record<string, string> = {
    none: "bg-zinc-100 text-zinc-700",
    minor: "bg-yellow-100 text-yellow-700",
    major: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };

  const statusColors: Record<string, string> = {
    investigating: "bg-yellow-100 text-yellow-700",
    identified: "bg-orange-100 text-orange-700",
    monitoring: "bg-blue-100 text-blue-700",
    resolved: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-muted-foreground">
            Track and manage incidents across your status pages
          </p>
        </div>
        <Link href="/incidents/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Incident
          </Button>
        </Link>
      </div>

      {userIncidents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-lg">No incidents</p>
            <p className="text-muted-foreground mt-1">
              Incidents will appear here when monitors go down
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {userIncidents.map(({ incident, statusPage }) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{incident.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {statusPage.name} &middot;{" "}
                      {new Date(incident.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={impactColors[incident.impact]}
                      variant="secondary"
                    >
                      {incident.impact}
                    </Badge>
                    <Badge
                      className={statusColors[incident.status]}
                      variant="secondary"
                    >
                      {incident.status}
                    </Badge>
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
