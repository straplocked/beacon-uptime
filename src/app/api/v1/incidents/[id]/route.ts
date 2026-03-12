import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { getApiKeyUser } from "@/lib/auth/api-key";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { withRateLimit } from "@/lib/rate-limit";

const updateIncidentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
  impact: z.enum(["none", "minor", "major", "critical"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApiKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(user.plan as PlanType)) {
    return NextResponse.json({ error: "API access not available on your plan" }, { status: 403 });
  }

  const rateLimited = await withRateLimit(request, `api:${user.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.userId, user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
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
