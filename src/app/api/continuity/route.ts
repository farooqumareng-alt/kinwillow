import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptField, encryptionConfigured } from "@/lib/crypto";

// Create a continuity record. Recovery instructions / key location arrive as
// plaintext over HTTPS, are encrypted here (field-level, per-household key),
// and only the ciphertext is stored.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const householdId = body?.household_id as string | undefined;
  const providerId = body?.provider_id as string | undefined;
  if (!householdId || !providerId) {
    return NextResponse.json({ error: "household_id and provider_id are required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("grant_level")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.grant_level !== "edit") {
    return NextResponse.json({ error: "You do not have edit access to this household" }, { status: 403 });
  }

  const recoveryPath = (body?.recovery_path as string | undefined)?.trim();
  const keyLocation = (body?.key_location as string | undefined)?.trim();
  let recovery_path_enc: string | null = null;
  let key_location_enc: string | null = null;
  if (recoveryPath || keyLocation) {
    if (!encryptionConfigured()) {
      return NextResponse.json(
        { error: "Field encryption is not configured on the server yet — record created without the sensitive fields is not allowed. Try again after configuration." },
        { status: 501 }
      );
    }
    if (recoveryPath) recovery_path_enc = encryptField(householdId, recoveryPath);
    if (keyLocation) key_location_enc = encryptField(householdId, keyLocation);
  }

  const { data: record, error } = await supabase
    .from("continuity_records")
    .insert({
      household_id: householdId,
      provider_id: providerId,
      account_ref: body?.account_ref ?? null,
      designated_recipient: body?.designated_recipient ?? null,
      criticality: body?.criticality ?? "medium",
      release_scope: keyLocation ? "instructions_and_key_location" : "instructions_only",
      recovery_path_enc,
      key_location_enc,
      verified_state: "in_progress",
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("state_transitions").insert({
    record_id: record.id,
    household_id: householdId,
    from_state: null,
    to_state: "in_progress",
    actor: user.id,
    reason: "Record created",
  });
  await supabase.rpc("append_audit", {
    p_household: householdId,
    p_actor: user.id,
    p_action: "continuity.record_created",
    p_entity: "continuity_record",
    p_entity_id: record.id,
  });

  return NextResponse.json({ record });
}
