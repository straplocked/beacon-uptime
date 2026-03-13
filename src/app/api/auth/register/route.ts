import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organizations, organizationMembers } from "@/lib/db/schema";
import { hashPassword, createSession, getSessionCookieName, getOrgCookieName, getSessionDurationMs } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;

    // Check if user already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
      })
      .returning();

    // Create personal organization
    const orgSlug = email.toLowerCase().replace("@", "-at-");
    const [org] = await db
      .insert(organizations)
      .values({
        name: `${name}'s Organization`,
        slug: orgSlug,
        plan: "free",
      })
      .returning();

    // Create owner membership
    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    // Create session
    const sessionId = await createSession(user.id);

    const response = NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name }, organization: { id: org.id, plan: org.plan } },
      { status: 201 }
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: getSessionDurationMs() / 1000,
    };

    response.cookies.set(getSessionCookieName(), sessionId, cookieOptions);
    response.cookies.set(getOrgCookieName(), org.id, cookieOptions);

    return response;
  } catch (error) {
    console.error("[auth/register] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
