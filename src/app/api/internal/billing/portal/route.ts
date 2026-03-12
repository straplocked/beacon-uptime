import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createCustomerPortalSession } from "@/lib/stripe";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found" },
      { status: 400 }
    );
  }

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  try {
    const session = await createCustomerPortalSession(
      user.stripeCustomerId,
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
