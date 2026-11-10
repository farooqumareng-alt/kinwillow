import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Open the Stripe Customer Portal for the household's subscription.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const householdId = body?.household_id as string | undefined;
  if (!householdId) return NextResponse.json({ error: "household_id is required" }, { status: 400 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("household_id", householdId)
    .single();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription on file for this household" }, { status: 404 });
  }

  const origin = req.headers.get("origin") ?? "https://www.kinwillow.com";
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/app/billing`,
  });
  return NextResponse.json({ url: session.url });
}
