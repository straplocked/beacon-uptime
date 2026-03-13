import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationMembers } from "@/lib/db/schema";
import { getCurrentUser, getOrgCookieName, getSessionDurationMs } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify user is a member of this org
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.organizationId, id)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(getOrgCookieName(), id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getSessionDurationMs() / 1000,
  });

  return response;
}
