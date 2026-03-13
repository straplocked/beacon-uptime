import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, incidentUpdates, statusPages } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { canEditResources } from "@/lib/auth/permissions";

const updateIncidentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z
    .enum(["investigating", "identified", "monitoring", "resolved"])
    .optional(),
  impact: z.enum(["none", "minor", "major", "critical"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [incident] = await db
    .select({
      incident: incidents,
      statusPageName: statusPages.name,
      statusPageSlug: statusPages.slug,
    })
    .from(incidents)
    .innerJoin(statusPages, eq(incidents.statusPageId, statusPages.id))
    .where(and(eq(incidents.id, id), eq(incidents.organizationId, ctx.organization.id)))
    .limit(1);

  if (!incident) {
    return NextResponse.json(
      { error: "Incident not found" },
      { status: 404 }
    );
  }

  const updates = await db
    .select()
    .from(incidentUpdates)
    .where(eq(incidentUpdates.incidentId, id))
    .orderBy(asc(incidentUpdates.createdAt));

  return NextResponse.json({ ...incident, updates });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditResources(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.organizationId, ctx.organization.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Incident not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = updateIncidentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.impact !== undefined) updateData.impact = data.impact;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "resolved" && !existing.resolvedAt) {
      updateData.resolvedAt = new Date();
    } else if (data.status !== "resolved") {
      updateData.resolvedAt = null;
    }
  }

  const [updated] = await db
    .update(incidents)
    .set(updateData)
    .where(eq(incidents.id, id))
    .returning();

  return NextResponse.json({ incident: updated });
}
