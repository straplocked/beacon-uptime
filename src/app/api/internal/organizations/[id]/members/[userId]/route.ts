import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationMembers } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { canManageMembers } from "@/lib/auth/permissions";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id, userId } = await params;

  if (ctx.organization.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot change owner's role
  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot change the owner's role" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateRoleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({ role: parsed.data.role })
    .where(eq(organizationMembers.id, target.id))
    .returning();

  return NextResponse.json({ member: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageMembers(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id, userId } = await params;

  if (ctx.organization.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot remove the owner
  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, id),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 });
  }

  await db.delete(organizationMembers).where(eq(organizationMembers.id, target.id));

  return NextResponse.json({ success: true });
}
