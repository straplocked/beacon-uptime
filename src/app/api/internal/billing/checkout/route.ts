import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { canManageBilling } from "@/lib/auth/permissions";
import { createCheckoutSession } from "@/lib/stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "team"]),
});

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  try {
    const session = await createCheckoutSession(
      ctx.organization.id,
      ctx.user.email,
      parsed.data.plan,
      baseUrl,
      ctx.organization.stripeCustomerId ?? undefined
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing] Checkout session error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
