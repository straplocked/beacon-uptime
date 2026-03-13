import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationInvitations, organizationMembers } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { canManageMembers } from "@/lib/auth/permissions";
import { canAddMember } from "@/lib/plans";
import type { PlanType } from "@/lib/plans";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  if (ctx.organization.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check plan limits
  const [memberCount] = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, id));

  if (!canAddMember(ctx.organization.plan as PlanType, memberCount.count)) {
    return NextResponse.json(
      { error: "Team member limit reached for your plan" },
      { status: 403 }
    );
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      organizationId: id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      invitedByUserId: ctx.user.id,
      expiresAt,
    })
    .returning();

  return NextResponse.json({ invitation }, { status: 201 });
}
