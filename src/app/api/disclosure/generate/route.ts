import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPackageContent } from "@/lib/disclosure";

// Owner action: once a request's waiting period has passed without a veto,
// generate the per-contact recovery package (state-gated content snapshot)
// and mark the request RELEASED. The contact opens it via a time-limited link.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const requestId = body?.request_id as string | undefined;
  if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 400 });

  const { data: request } = await supabase
    .from("disclosure_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.state !== "waiting") {
    return NextResponse.json({ error: `This request is ${request.state}` }, { status: 409 });
  }
  if (new Date(request.release_at).getTime() > Date.now()) {
    return NextResponse.json(
      { error: `The waiting period ends ${new Date(request.release_at).toLocaleString()}. The package cannot be generated before then.` },
      { status: 409 }
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Service role is not configured" }, { status: 501 });
  }

  const { entries, withheld } = await buildPackageContent(service, request.household_id, request.trusted_contact_id);
  const expires = new Date(Date.now() + 7 * 24 * 3600_000);
  const { data: pkg, error } = await service
    .from("disclosure_packages")
    .insert({
      request_id: request.id,
      household_id: request.household_id,
      trusted_contact_id: request.trusted_contact_id,
      content: { entries, withheld_count: withheld, generated_at: new Date().toISOString() },
      expires_at: expires.toISOString(),
    })
    .select("id, access_token, expires_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await service
    .from("disclosure_requests")
    .update({ state: "released" })
    .eq("id", request.id);
  await service.rpc("append_audit", {
    p_household: request.household_id,
    p_actor: user.id,
    p_action: "disclosure.package_generated",
    p_entity: "disclosure_package",
    p_entity_id: pkg.id,
  });

  return NextResponse.json({ package_id: pkg.id, access_token: pkg.access_token, expires_at: pkg.expires_at });
}
