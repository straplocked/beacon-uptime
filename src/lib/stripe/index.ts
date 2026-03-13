// Stripe integration stub for OSS edition.
// The premium overlay replaces this file with real Stripe integration.

export function getStripe(): never {
  throw new Error("Stripe is not available in the OSS edition");
}

export const STRIPE_PRICES = {
  pro: "",
  team: "",
};

export async function createCheckoutSession(
  _organizationId: string,
  _userEmail: string,
  _plan: "pro" | "team",
  _baseUrl: string,
  _customerId?: string
): Promise<{ url: string | null }> {
  throw new Error("Stripe is not available in the OSS edition");
}

export async function createCustomerPortalSession(
  _stripeCustomerId: string,
  _baseUrl: string
): Promise<{ url: string }> {
  throw new Error("Stripe is not available in the OSS edition");
}
