import { db } from "@/lib/db";
import { incidents, incidentUpdates, statusPages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { IncidentUpdateForm } from "@/components/dashboard/incident-update-form";

const statusColors: Record<string, string> = {
  investigating: "bg-yellow-100 text-yellow-800",
  identified: "bg-orange-100 text-orange-800",
  monitoring: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

const impactColors: Record<string, string> = {
  none: "bg-gray-100 text-gray-800",
  minor: "bg-yellow-100 text-yellow-800",
  major: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;

  const [result] = await db
    .select({
      incident: incidents,
      statusPageName: statusPages.name,
      statusPageSlug: statusPages.slug,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(and(eq(incidents.id, id), eq(incidents.userId, user.id)))
    .limit(1);

  if (!result) notFound();

  const updates = await db
    .select()
    .from(incidentUpdates)
    .where(eq(incidentUpdates.incidentId, id))
    .orderBy(asc(incidentUpdates.createdAt));

  const { incident } = result;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/incidents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{incident.title}</h1>
          <p className="text-muted-foreground">
            on {result.statusPageName}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className={statusColors[incident.status] || ""}>
            {incident.status}
          </Badge>
          <Badge className={impactColors[incident.impact] || ""}>
            {incident.impact}
          </Badge>
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">
                {new Date(incident.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                {incident.resolvedAt ? "Resolved" : "Last Updated"}
              </p>
              <p className="font-medium">
                {new Date(
                  incident.resolvedAt || incident.updatedAt
                ).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Update timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {updates.map((update, i) => (
              <div
                key={update.id}
                className={`relative pl-6 pb-4 ${i < updates.length - 1 ? "border-l border-muted ml-2" : "ml-2"}`}
              >
                <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-muted-foreground/30" />
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={`text-xs ${statusColors[update.status] || ""}`}
                  >
                    {update.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(update.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{update.message}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add update form */}
      {incident.status !== "resolved" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Update</CardTitle>
          </CardHeader>
          <CardContent>
            <IncidentUpdateForm
              incidentId={incident.id}
              currentStatus={incident.status}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
