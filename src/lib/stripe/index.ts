import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  team: process.env.STRIPE_TEAM_PRICE_ID!,
};

export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  plan: "pro" | "team",
  baseUrl: string
) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userEmail,
    line_items: [
      {
        price: STRIPE_PRICES[plan],
        quantity: 1,
      },
    ],
    metadata: {
      userId,
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
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  });

  return session;
}
