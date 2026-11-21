import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, TIER_PRICES } from "@/lib/stripe";
import { siteUrl } from "@/lib/email";

// Start or change an annual plan.
//  - No live subscription yet: open Stripe Checkout.
//  - A live subscription already exists: change its price in place (Stripe
//    prorates). Opening a second Checkout here would create a second
//    subscription and bill the customer twice.
// Billing always belongs to the owner's own household, never a parents' vault.
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const tier = body?.tier as string | undefined;
  const householdId = body?.household_id as string | undefined;
  if (!tier || !householdId || !TIER_PRICES[tier]) {
    return NextResponse.json({ error: "That plan is not available yet" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("role, households ( kind )")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only the household owner can change the plan" }, { status: 403 });
  }
  if ((membership as unknown as { households: { kind: string } | null }).households?.kind !== "own") {
    return NextResponse.json({ error: "Plans are managed from your own vault's Billing page." }, { status: 400 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, tier")
    .eq("household_id", householdId)
    .maybeSingle();

  const stripe = getStripe();
  const metadata = { household_id: householdId, tier };

  if (sub?.stripe_subscription_id && LIVE.has(sub.status ?? "")) {
    if (sub.tier === tier && sub.status === "active") {
      return NextResponse.json({ error: "You are already on that plan." }, { status: 409 });
    }
    try {
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const item = current.items.data[0];
      if (!item) throw new Error("subscription has no items");
      await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price: TIER_PRICES[tier]! }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata,
      });
      // The webhook (customer.subscription.updated) applies the new plan.
      return NextResponse.json({ updated: true });
    } catch (err) {
      console.error(`[billing] could not change the plan for household ${householdId}`, err);
      return NextResponse.json(
        { error: "We couldn't change your plan just now. Nothing was charged — please try again, or use the billing portal." },
        { status: 502 }
      );
    }
  }

  // Clients who signed up through a partner's link get the partner discount,
  // if one is configured (a Stripe coupon id in STRIPE_PARTNER_COUPON).
  const coupon = process.env.STRIPE_PARTNER_COUPON;
  let referred = false;
  if (coupon) {
    const { data: profile } = await supabase.from("profiles").select("referred_by").eq("user_id", user.id).maybeSingle();
    referred = Boolean(profile?.referred_by);
  }

  const origin = req.headers.get("origin") ?? siteUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: TIER_PRICES[tier]!, quantity: 1 }],
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: householdId,
    metadata,
    subscription_data: { metadata },
    ...(coupon && referred ? { discounts: [{ coupon }] } : {}),
    success_url: `${origin}/app/billing?upgraded=1`,
    cancel_url: `${origin}/app/billing`,
  });

  return NextResponse.json({ url: session.url });
}
