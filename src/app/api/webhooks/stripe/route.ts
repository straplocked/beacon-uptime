import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PlanType } from "@/lib/plans";

function priceToPlan(priceId: string): PlanType | null {
  if (priceId === STRIPE_PRICES.pro) return "pro";
  if (priceId === STRIPE_PRICES.team) return "team";
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const organizationId = session.metadata?.organizationId;
        const plan = session.metadata?.plan as PlanType | undefined;

        if (!organizationId || !plan) {
          console.error("[stripe webhook] Missing metadata on checkout session");
          break;
        }

        await db
          .update(organizations)
          .set({
            plan,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organizationId));

        console.log(
          `[stripe webhook] Organization ${organizationId} upgraded to ${plan}`
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const priceId = subscription.items.data[0]?.price?.id;

        if (!priceId) break;

        const plan = priceToPlan(priceId);
        if (!plan) break;

        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.stripeSubscriptionId, subscription.id))
          .limit(1);

        if (org) {
          await db
            .update(organizations)
            .set({ plan, updatedAt: new Date() })
            .where(eq(organizations.id, org.id));

          console.log(
            `[stripe webhook] Organization ${org.id} plan changed to ${plan}`
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.stripeSubscriptionId, subscription.id))
          .limit(1);

        if (org) {
          await db
            .update(organizations)
            .set({
              plan: "free",
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            })
            .where(eq(organizations.id, org.id));

          console.log(
            `[stripe webhook] Organization ${org.id} reverted to free plan`
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.warn(
          `[stripe webhook] Payment failed for customer ${invoice.customer}`
        );
        break;
      }
    }
  } catch (err) {
    console.error("[stripe webhook] Error handling event:", err);
    return NextResponse.json(
      { error: "Webhook handler error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
