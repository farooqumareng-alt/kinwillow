import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptField, encryptionConfigured } from "@/lib/crypto";

// Save the encrypted sensitive fields (recovery instructions, key location)
// on an existing continuity record.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const recordId = body?.record_id as string | undefined;
  if (!recordId) return NextResponse.json({ error: "record_id is required" }, { status: 400 });

  const { data: record } = await supabase
    .from("continuity_records")
    .select("id, household_id")
    .eq("id", recordId)
    .single();
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const recoveryPath = (body?.recovery_path as string | undefined)?.trim();
  const keyLocation = (body?.key_location as string | undefined)?.trim();
  if (!recoveryPath && !keyLocation) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }
  if (!encryptionConfigured()) {
    return NextResponse.json(
      { error: "Field encryption is not configured on the server yet." },
      { status: 501 }
    );
  }

  const patch: Record<string, string> = {};
  if (recoveryPath) patch.recovery_path_enc = encryptField(record.household_id, recoveryPath);
  if (keyLocation) {
    patch.key_location_enc = encryptField(record.household_id, keyLocation);
    patch.release_scope = "instructions_and_key_location";
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("continuity_records").update(patch).eq("id", recordId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.rpc("append_audit", {
    p_household: record.household_id,
    p_actor: user.id,
    p_action: "continuity.fields_saved",
    p_entity: "continuity_record",
    p_entity_id: record.id,
  });

  return NextResponse.json({ ok: true });
}
