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
    // Ignore a stale event for a subscription that is no longer the household's
    // current one (for example an old, cancelled subscription), so it cannot
    // seal a household that has a newer live plan.
    const { data: known } = await service
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("household_id", householdId)
      .maybeSingle();
    const liveStates = ["active", "trialing", "past_due"];
    if (
      !active &&
      known?.stripe_subscription_id &&
      known.stripe_subscription_id !== sub.id &&
      liveStates.includes(known.status ?? "")
    ) {
      console.log(`[billing] ignored ${sub.status} event for superseded subscription ${sub.id}`);
      return;
    }

    // A deleted account's household is gone; its final "subscription deleted"
    // event has nothing left to update and must not be retried forever.
    const { data: exists } = await service.from("households").select("id").eq("id", householdId).maybeSingle();
    if (!exists) {
      console.log(`[billing] ${sub.status} event for household ${householdId}, which no longer exists; nothing to do`);
      return;
    }

    const { error: subError } = await service.from("subscriptions").upsert({
      household_id: householdId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      tier,
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (subError) throw new Error(`subscriptions upsert failed: ${subError.message}`);

    // The owner's own household: active on the paid tier, or sealed (never
    // purged) on the free-tier gates when the plan lapses.
    const { data: own, error: ownError } = await service
      .from("households")
      .update(active ? { plan_tier: tier, status: "active" } : { plan_tier: "free", status: "sealed" })
      .eq("id", householdId)
      .select("owner_id")
      .single();
    if (ownError || !own) throw new Error(`household update failed: ${ownError?.message ?? "not found"}`);

    // The parents' vault follows the plan: usable only while the owner is on
    // Family + Parents, otherwise sealed (read-only, still exportable, and its
    // emergency process keeps working).
    const parentsActive = active && tier === "family_parents";
    const { error: parentsError } = await service
      .from("households")
      .update(parentsActive ? { plan_tier: "family_parents", status: "active" } : { plan_tier: "free", status: "sealed" })
      .eq("owner_id", own.owner_id)
      .eq("kind", "parents");
    if (parentsError) throw new Error(`parents household update failed: ${parentsError.message}`);
    await service.rpc("append_audit", {
      p_household: householdId,
      p_actor: null,
      p_action: `billing.subscription_${sub.status}`,
      p_entity: "subscription",
      p_entity_id: null,
    });
  }

  // syncSubscription always reads the subscription's current state from
  // Stripe, so a repeated or out-of-order delivery lands on the same result.
  // A failure returns 500 so Stripe retries instead of the plan silently
  // drifting out of step with what the customer paid for.
  try {
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
  } catch (err) {
    console.error(`[billing] webhook ${event.type} (${event.id}) failed`, err);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
