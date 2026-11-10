import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/crypto";

// Full household export (the owner's own data, as JSON). Always available —
// including for sealed households (spec §8.4). Export is audit-logged.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });
  const hid = membership.household_id as string;

  const [household, items, documents, records, contacts, scopes] = await Promise.all([
    supabase.from("households").select("*").eq("id", hid).single(),
    supabase.from("inventory_items").select("*").eq("household_id", hid),
    supabase.from("documents").select("*").eq("household_id", hid),
    supabase.from("continuity_records").select("*").eq("household_id", hid),
    supabase.from("trusted_contacts").select("id, name, email, phone, relationship, status, created_at").eq("household_id", hid),
    supabase.from("release_scopes").select("*").eq("household_id", hid),
  ]);

  const tryDecrypt = (enc: string | null) => {
    if (!enc) return null;
    try {
      return decryptField(hid, enc);
    } catch {
      return null;
    }
  };
  const recordsOut = (records.data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    recovery_path: tryDecrypt(r.recovery_path_enc as string | null),
    key_location: tryDecrypt(r.key_location_enc as string | null),
    recovery_path_enc: undefined,
    key_location_enc: undefined,
  }));

  await supabase.rpc("append_audit", {
    p_household: hid,
    p_actor: user.id,
    p_action: "household.exported",
    p_entity: "household",
    p_entity_id: hid,
  });

  return new NextResponse(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        household: household.data,
        inventory_items: items.data,
        documents: documents.data,
        continuity_records: recordsOut,
        trusted_contacts: contacts.data,
        release_scopes: scopes.data,
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="kinwillow-export.json"',
      },
    }
  );
}
