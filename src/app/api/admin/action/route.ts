import { NextResponse } from "next/server";
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
