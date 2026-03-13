import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
      },
      organization: {
        id: ctx.organization.id,
        name: ctx.organization.name,
        slug: ctx.organization.slug,
        plan: ctx.organization.plan,
      },
      role: ctx.role,
    });
  } catch (error) {
    console.error("[auth/me] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
