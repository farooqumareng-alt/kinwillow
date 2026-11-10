import { NextResponse } from "next/server";
import { getStripe, tierForPrice } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

// Stripe webhook — the source of truth for plan state. Syncs the
// subscriptions cache and the household's plan tier / status.
// Sealed policy (spec §8.4): a lapsed household is sealed, never deleted —
// read-only for the owner, export always available, emergency flow intact.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 501 });

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const service = createServiceClient();

  async function syncSubscription(subId: string) {
    const sub = await stripe.subscriptions.retrieve(subId);
    const householdId = (sub.metadata?.household_id as string) ?? null;
    if (!householdId) return;
    const priceId = sub.items.data[0]?.price?.id ?? "";
    const tier = tierForPrice(priceId) ?? (sub.metadata?.tier as string) ?? "family";
    const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
    await service.from("subscriptions").upsert({
      household_id: householdId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (active) {
      await service
        .from("households")
        .update({ plan_tier: tier, status: "active" })
        .eq("id", householdId);
    } else {
      // Lapsed/cancelled: seal (never purge) and return to free-tier gates.
      await service
        .from("households")
        .update({ plan_tier: "free", status: "sealed" })
        .eq("id", householdId);
    }
    await service.rpc("append_audit", {
      p_household: householdId,
      p_actor: null,
      p_action: `billing.subscription_${sub.status}`,
      p_entity: "subscription",
      p_entity_id: null,
    });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription((event.data.object as { id: string }).id);
      break;
    case "checkout.session.completed": {
      const session = event.data.object as { subscription?: string | null };
      if (session.subscription) await syncSubscription(session.subscription);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
