import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { canManageBilling } from "@/lib/auth/permissions";
import { createCustomerPortalSession } from "@/lib/stripe";

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageBilling(ctx.role)) {
    return NextResponse.json(
      { error: "Only the organization owner can manage billing" },
      { status: 403 }
    );
  }

  if (!ctx.organization.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found" },
      { status: 400 }
    );
  }

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  try {
    const session = await createCustomerPortalSession(
      ctx.organization.stripeCustomerId,
      baseUrl
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] Portal session error:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
