import Stripe from "stripe";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_FAMILY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

export const TIER_PRICES: Record<string, string | undefined> = {
  family: process.env.STRIPE_PRICE_FAMILY,
  family_parents: process.env.STRIPE_PRICE_FAMILY_PARENTS,
};

export function tierForPrice(priceId: string): string | null {
  if (priceId === process.env.STRIPE_PRICE_FAMILY) return "family";
  if (priceId === process.env.STRIPE_PRICE_FAMILY_PARENTS) return "family_parents";
  return null;
}
