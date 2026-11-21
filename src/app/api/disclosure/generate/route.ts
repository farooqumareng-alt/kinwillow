import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseRequest } from "@/lib/release";

// Owner action: release a request now, once its waiting period has passed.
// Release also happens automatically (see /api/cron/disclosure) — this is the
// owner choosing not to wait for the next scheduled run.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const requestId = body?.request_id as string | undefined;
  if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 400 });

  // Read through the user's own session: row-level security proves membership.
  const { data: request } = await supabase
    .from("disclosure_requests")
    .select("id, household_id, state, release_at")
    .eq("id", requestId)
    .single();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  // Owner only (a helper invited into the vault cannot release), and not
  // tied to the plan, so it keeps working for a sealed (read-only) household.
  const ownerCheck = await supabase.rpc("is_household_owner", { hid: request.household_id });
  let isOwner = ownerCheck.data === true;
  if (ownerCheck.error) {
    // is_household_owner arrives with migration 000016. Until it is run there
    // are no helpers, so every editor is the owner: fall back to that check.
    console.error("[disclosure] is_household_owner() is unavailable — has migration 000016 been run?", ownerCheck.error.message);
    const fallback = await supabase.rpc("has_member_edit", { hid: request.household_id });
    isOwner = fallback.data === true;
  }
  if (!isOwner) return NextResponse.json({ error: "Only the vault's owner can release this request" }, { status: 403 });
  if (request.state !== "waiting") {
    return NextResponse.json({ error: `This request is ${request.state}` }, { status: 409 });
  }
  if (new Date(request.release_at).getTime() > Date.now()) {
    return NextResponse.json(
      { error: "The waiting period is not over yet. The package cannot be released before then." },
      { status: 409 }
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Service role is not configured" }, { status: 501 });
  }

  const result = await releaseRequest(service, request.id, { actor: user.id, requireOwnerNotified: false });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    package_id: result.package_id,
    access_token: result.access_token,
    expires_at: result.expires_at,
    contact_notified: result.contact_notified,
  });
}
