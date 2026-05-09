/**
 * POST /api/v1/incidents/[id]/acknowledge — public API.
 *
 * Same semantics as /api/internal/incidents/[id]/acknowledge but
 * authed by Bearer API key. The API key is org-scoped, so the
 * acknowledge timeline entry is attributed to the org (no user id).
 */

import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getApiKeyOrg } from "@/lib/auth/api-key";
import { db } from "@/lib/db";
import { incidents, incidentUpdates } from "@/lib/db/schema";
import { canUseApi, type PlanType } from "@/lib/plans";
import { withRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const org = await getApiKeyOrg(request);
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseApi(org.plan as PlanType)) {
    return NextResponse.json(
      { error: "API access not available on your plan" },
      { status: 403 },
    );
  }

  const rateLimited = await withRateLimit(request, `api:${org.id}`, 60, 60);
  if (rateLimited) return rateLimited;

  const { id } = await params;

  const [incident] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.organizationId, org.id)))
    .limit(1);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  if (incident.acknowledgedAt) {
    return NextResponse.json(
      {
        error: "Already acknowledged",
        acknowledgedAt: incident.acknowledgedAt,
      },
      { status: 409 },
    );
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(incidents)
      .set({ acknowledgedAt: now, updatedAt: now })
      .where(and(eq(incidents.id, id), isNull(incidents.acknowledgedAt)))
      .returning({ id: incidents.id });
    if (claimed.length === 0) return;
    await tx.insert(incidentUpdates).values({
      incidentId: id,
      status: incident.status,
      message: "Incident acknowledged via API.",
      kind: "system",
    });
  });

  const [refreshed] = await db
    .select({
      id: incidents.id,
      acknowledgedAt: incidents.acknowledgedAt,
    })
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);

  return NextResponse.json({ incident: refreshed }, { status: 200 });
}
