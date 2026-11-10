import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/crypto";

// Reveal one encrypted field of a continuity record to a household member.
// Every reveal is written to the hash-chained audit log.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const recordId = body?.record_id as string | undefined;
  const field = body?.field as string | undefined;
  if (!recordId || (field !== "recovery_path" && field !== "key_location")) {
    return NextResponse.json({ error: "record_id and a valid field are required" }, { status: 400 });
  }

  const { data: record } = await supabase
    .from("continuity_records")
    .select("id, household_id, recovery_path_enc, key_location_enc")
    .eq("id", recordId)
    .single();
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const stored = field === "recovery_path" ? record.recovery_path_enc : record.key_location_enc;
  if (!stored) return NextResponse.json({ value: null });

  let value: string;
  try {
    value = decryptField(record.household_id, stored);
  } catch {
    return NextResponse.json({ error: "Could not decrypt this field" }, { status: 500 });
  }

  await supabase.rpc("append_audit", {
    p_household: record.household_id,
    p_actor: user.id,
    p_action: `continuity.${field}_revealed`,
    p_entity: "continuity_record",
    p_entity_id: record.id,
  });

  return NextResponse.json({ value });
}
