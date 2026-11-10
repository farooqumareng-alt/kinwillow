import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, TIER_PRICES } from "@/lib/stripe";

// Start a Stripe Checkout session for an annual plan upgrade.
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
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only the household owner can change the plan" }, { status: 403 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("household_id", householdId)
    .single();

  const origin = req.headers.get("origin") ?? "https://www.kinwillow.com";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: TIER_PRICES[tier]!, quantity: 1 }],
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: householdId,
    metadata: { household_id: householdId, tier },
    subscription_data: { metadata: { household_id: householdId, tier } },
    success_url: `${origin}/app/billing?upgraded=1`,
    cancel_url: `${origin}/app/billing`,
  });

  return NextResponse.json({ url: session.url });
}
