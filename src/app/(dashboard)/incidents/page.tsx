import { db } from "@/lib/db";
import { incidents, statusPages } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function IncidentsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const userIncidents = await db
    .select({
      incident: incidents,
      statusPage: statusPages,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(eq(incidents.organizationId, ctx.organization.id))
    .orderBy(desc(incidents.createdAt));

  const impactColors: Record<string, string> = {
    none: "bg-slate-100 text-slate-700",
    minor: "bg-amber-100 text-amber-700",
    major: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };

  const statusColors: Record<string, string> = {
    investigating: "bg-amber-100 text-amber-700",
    identified: "bg-orange-100 text-orange-700",
    monitoring: "bg-sky-100 text-sky-700",
    resolved: "bg-teal-100 text-teal-700",
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
