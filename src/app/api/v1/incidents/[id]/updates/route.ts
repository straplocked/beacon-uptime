import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, incidentUpdates } from "@/lib/db/schema";
import { getApiKeyUser } from "@/lib/auth/api-key";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { canUseApi } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";
import { withRateLimit } from "@/lib/rate-limit";

const addUpdateSchema = z.object({
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  message: z.string().min(1).max(2000),
});

export async function POST(
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

  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.userId, user.id)))
    .limit(1);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = addUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [update] = await tx
      .insert(incidentUpdates)
      .values({
        incidentId: id,
        status: data.status,
        message: data.message,
      })
      .returning();

    const incidentUpdate: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.status === "resolved" && !incident.resolvedAt) {
      incidentUpdate.resolvedAt = new Date();
    } else if (data.status !== "resolved") {
      incidentUpdate.resolvedAt = null;
    }

    await tx
      .update(incidents)
      .set(incidentUpdate)
      .where(eq(incidents.id, id));

    return update;
  });

  return NextResponse.json({ update: result }, { status: 201 });
}
