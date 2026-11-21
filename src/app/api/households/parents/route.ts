import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionState } from "@/lib/session";
import { MEMBERSHIP_SELECT, ownHousehold, type MembershipRow } from "@/lib/household-select";

// Create the second household of the Family + Parents plan: a separate vault
// for the owner's parents, managed from the owner's account. One per owner.
// The server creates it (there is no insert policy on households) after
// checking the plan on the owner's own household.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if ((await getSessionState(supabase)) !== "ok") {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80) || "My parents' household";

  const { data: memberships } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user.id);
  const rows = (memberships ?? []) as unknown as MembershipRow[];
  const own = ownHousehold(rows);
  if (!own?.households || own.role !== "owner") {
    return NextResponse.json({ error: "Only the household owner can add a parents' vault." }, { status: 403 });
  }
  if (own.households.plan_tier !== "family_parents" || own.households.status !== "active") {
    return NextResponse.json(
      { error: "A parents' vault is part of the Family + Parents plan. Upgrade on the Billing page to add one." },
      { status: 402 }
    );
  }
  const existing = rows.find((r) => r.households?.kind === "parents");
  if (existing?.households) {
    return NextResponse.json({ ok: true, household_id: existing.households.id, already_existed: true });
  }

  const service = createServiceClient();
  const { data: household, error } = await service
    .from("households")
    .insert({ name, owner_id: user.id, kind: "parents", plan_tier: "family_parents", status: "active" })
    .select("id")
    .single();
  if (error || !household) {
    console.error(`[households] could not create a parents household for ${user.id}`, error?.message);
    return NextResponse.json({ error: "Could not create the vault. Please try again." }, { status: 500 });
  }
  const { error: memberError } = await service
    .from("household_members")
    .insert({ household_id: household.id, user_id: user.id, role: "owner", grant_level: "edit" });
  if (memberError) {
    // Without the membership row nobody could open it: undo rather than orphan it.
    await service.from("households").delete().eq("id", household.id);
    console.error(`[households] could not add the owner to ${household.id}`, memberError.message);
    return NextResponse.json({ error: "Could not create the vault. Please try again." }, { status: 500 });
  }
  await service.rpc("append_audit", {
    p_household: household.id,
    p_actor: user.id,
    p_action: "household.created",
    p_entity: "household",
    p_entity_id: household.id,
  });
  return NextResponse.json({ ok: true, household_id: household.id });
}
