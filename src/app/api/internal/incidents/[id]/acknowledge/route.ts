/**
 * POST /api/internal/incidents/[id]/acknowledge — claim the incident.
 *
 * Sprint 5 (Diff #1): the dashboard UI sets `acknowledgedAt` and
 * `acknowledgedByUserId` on first acknowledgement and emits a `system`
 * incident_update so the timeline reflects who took the page.
 */

import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { canEditResources } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { incidents, incidentUpdates } from "@/lib/db/schema";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canEditResources(ctx.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, id),
        eq(incidents.organizationId, ctx.organization.id),
      ),
    )
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
    // Re-check inside the tx to make this race-safe.
    const claimed = await tx
      .update(incidents)
      .set({
        acknowledgedAt: now,
        acknowledgedByUserId: ctx.user.id,
        updatedAt: now,
      })
      .where(and(eq(incidents.id, id), isNull(incidents.acknowledgedAt)))
      .returning({ id: incidents.id });
    if (claimed.length === 0) {
      // Another request beat us — no-op (the GET will reflect the winner).
      return;
    }
    await tx.insert(incidentUpdates).values({
      incidentId: id,
      status: incident.status,
      message: `${ctx.user.name} acknowledged the incident.`,
      kind: "system",
      authoredByUserId: ctx.user.id,
    });
  });

  const [refreshed] = await db
    .select({
      id: incidents.id,
      acknowledgedAt: incidents.acknowledgedAt,
      acknowledgedByUserId: incidents.acknowledgedByUserId,
    })
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);

  return NextResponse.json({ incident: refreshed }, { status: 200 });
}
