import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationInvitations, organizationMembers, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in to accept this invitation" }, { status: 401 });
  }

  const { token } = await params;

  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(eq(organizationInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.acceptedAt) {
    return NextResponse.json({ error: "Invitation has already been accepted" }, { status: 400 });
  }

  if (new Date() > invitation.expiresAt) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
  }

  // Check email matches
  if (invitation.email !== user.email) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // Check if already a member
  const [existingMember] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, invitation.organizationId),
        eq(organizationMembers.userId, user.id)
      )
    )
    .limit(1);

  if (existingMember) {
    return NextResponse.json({ error: "You are already a member of this organization" }, { status: 400 });
  }

  // Accept invitation
  await db.transaction(async (tx) => {
    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationInvitations.id, invitation.id));

    await tx.insert(organizationMembers).values({
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
    });
  });

  return NextResponse.json({
    success: true,
    organizationId: invitation.organizationId,
  });
}
