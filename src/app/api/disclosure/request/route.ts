import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyOwner, type DisclosureRequestRow } from "@/lib/release";
import { clientIp, withinLimits, tooManyRequests, HOUR, DAY } from "@/lib/rate-limit";

// Public: a trusted contact submits an emergency disclosure request using
// their personal request token. Creates the request in WAITING state with
// release_at = now + the household's waiting period, and audits it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.request_token as string | undefined;
  const requestClass = body?.request_class as string | undefined;
  const reason = (body?.reason as string | undefined)?.slice(0, 2000);
  if (!token || (requestClass !== "death" && requestClass !== "incapacity")) {
    return NextResponse.json({ error: "A valid link and request type are required" }, { status: 400 });
  }

  // Each request emails the owner and starts a waiting period, so a contact
  // (or anyone holding their link) cannot fire them repeatedly.
  const allowed = await withinLimits([
    { action: "disclosure:ip", subject: clientIp(req), limit: 10, windowSeconds: HOUR },
    { action: "disclosure:token", subject: token, limit: 3, windowSeconds: DAY },
  ]);
  if (!allowed) return tooManyRequests("Too many requests from this link. Please try again tomorrow.");

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "This service is not configured yet" }, { status: 501 });
  }

  const { data: contact } = await service
    .from("trusted_contacts")
    .select("id, household_id, name, status")
    .eq("request_token", token)
    .single();
  if (!contact || contact.status === "removed") {
    return NextResponse.json({ error: "This link is not valid" }, { status: 404 });
  }

  const { data: existing } = await service
    .from("disclosure_requests")
    .select("id")
    .eq("trusted_contact_id", contact.id)
    .eq("state", "waiting")
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A request is already in progress for this household. The waiting period from the first request applies." },
      { status: 409 }
    );
  }

  const { data: household } = await service
    .from("households")
    .select("waiting_period_hours, name")
    .eq("id", contact.household_id)
    .single();
  const hours = household?.waiting_period_hours ?? 168;
  const releaseAt = new Date(Date.now() + hours * 3600_000);

  const { data: request, error } = await service
    .from("disclosure_requests")
    .insert({
      household_id: contact.household_id,
      trusted_contact_id: contact.id,
      request_class: requestClass,
      reason: reason ?? null,
      state: "waiting",
      release_at: releaseAt.toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await service.rpc("append_audit", {
    p_household: contact.household_id,
    p_actor: null,
    p_action: "disclosure.requested",
    p_entity: "disclosure_request",
    p_entity_id: request.id,
  });

  // Notify the household owner so they can veto during the wait. The veto is
  // the safeguard, so the outcome is recorded: the scheduled job retries a
  // failed notification and never auto-releases a request the owner was not
  // told about.
  let ownerNotified = false;
  try {
    ownerNotified = await notifyOwner(service, request as DisclosureRequestRow, "initial");
    if (ownerNotified) {
      await service
        .from("disclosure_requests")
        .update({ owner_notified_at: new Date().toISOString() })
        .eq("id", request.id);
    }
  } catch (err) {
    console.error(`[disclosure] request ${request.id}: owner notification threw`, err);
  }
  if (!ownerNotified) {
    console.error(`[disclosure] request ${request.id}: owner NOT notified; the scheduled job will retry`);
  }

  return NextResponse.json({
    ok: true,
    release_at: request.release_at,
    waiting_hours: hours,
    owner_notified: ownerNotified,
  });
}
