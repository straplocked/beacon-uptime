import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, incidentUpdates, statusPages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const createIncidentSchema = z.object({
  statusPageId: z.string().uuid(),
  title: z.string().min(1).max(200),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  impact: z.enum(["none", "minor", "major", "critical"]),
  message: z.string().min(1).max(2000),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIncidents = await db
    .select({
      incident: incidents,
      statusPageName: statusPages.name,
      statusPageSlug: statusPages.slug,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(eq(incidents.userId, user.id))
    .orderBy(desc(incidents.createdAt));

  return NextResponse.json({ incidents: userIncidents });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createIncidentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Verify status page belongs to user
  const [page] = await db
    .select()
    .from(statusPages)
    .where(
      and(
        eq(statusPages.id, data.statusPageId),
        eq(statusPages.userId, user.id)
      )
    )
    .limit(1);

  if (!page) {
    return NextResponse.json(
      { error: "Status page not found" },
      { status: 404 }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(incidents)
      .values({
        userId: user.id,
        statusPageId: data.statusPageId,
        title: data.title,
        status: data.status,
        impact: data.impact,
        resolvedAt: data.status === "resolved" ? new Date() : null,
      })
      .returning();

    const [update] = await tx
      .insert(incidentUpdates)
      .values({
        incidentId: incident.id,
        status: data.status,
        message: data.message,
      })
      .returning();

    return { incident, update };
  });

  return NextResponse.json(result, { status: 201 });
}
