import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  team: process.env.STRIPE_TEAM_PRICE_ID!,
};

export async function createCheckoutSession(
  organizationId: string,
  userEmail: string,
  plan: "pro" | "team",
  baseUrl: string,
  customerId?: string
) {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    ...(customerId ? { customer: customerId } : { customer_email: userEmail }),
    line_items: [
      {
        price: STRIPE_PRICES[plan],
        quantity: 1,
      },
    ],
    metadata: {
      organizationId,
      plan,
    },
    success_url: `${baseUrl}/settings/billing?success=true`,
    cancel_url: `${baseUrl}/settings/billing?canceled=true`,
  });

  return session;
}

export async function createCustomerPortalSession(
  stripeCustomerId: string,
  baseUrl: string
) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  });

  return session;
}
