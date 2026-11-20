import Stripe from "stripe";

export function stripeClient(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null; // local dev without payments configured
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}
