import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/admin";

// All Super Admin mutations go through this one route: the admin check runs
// first, and every action is written to the hash-chained audit log.
// Metadata only — this route never touches vault contents (spec §13 rule 1).
export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const { service, user } = ctx;

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  async function audit(householdId: string | null, name: string, entity: string, entityId: string | null) {
    await service.rpc("append_audit", {
      p_household: householdId,
      p_actor: user.id,
      p_action: `admin.${name}`,
      p_entity: entity,
      p_entity_id: entityId,
    });
  }

  if (action === "set_plan") {
    const householdId = body.household_id as string;
    const tier = body.tier as string;
    if (!["free", "family", "family_parents"].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    const { error } = await service.from("households").update({ plan_tier: tier }).eq("id", householdId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(householdId, `set_plan_${tier}`, "household", householdId);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_status") {
    const householdId = body.household_id as string;
    const status = body.status as string;
    if (!["active", "sealed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const { error } = await service.from("households").update({ status }).eq("id", householdId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(householdId, `household_${status}`, "household", householdId);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_partner") {
    const userId = body.user_id as string;
    const makePartner = body.is_partner === true;
    if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    const { data: profile } = await service.from("profiles").select("partner_code").eq("user_id", userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
    // A code is issued once and kept, so links already shared keep working if
    // partner status is removed and later restored.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code =
      profile.partner_code ??
      Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
    const { error } = await service.from("profiles").update({ is_partner: makePartner, partner_code: code }).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(null, makePartner ? "partner_granted" : "partner_removed", "profile", userId);
    return NextResponse.json({ ok: true, partner_code: code });
  }

  if (action === "inbox_state") {
    const table = body.table as string;
    const id = body.id as string;
    if (!["messages", "signups"].includes(table) || !id) {
      return NextResponse.json({ error: "Invalid inbox target" }, { status: 400 });
    }
    const patch: Record<string, string | null> = {};
    if (typeof body.read === "boolean") patch.read_at = body.read ? new Date().toISOString() : null;
    if (typeof body.archived === "boolean") patch.archived_at = body.archived ? new Date().toISOString() : null;
    const { error } = await service.from(table).update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(null, `inbox_${table}_state`, table, id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
