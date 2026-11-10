import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendEmail } from "@/lib/email";

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

  // Notify the household owner (best-effort): they may veto during the wait.
  try {
    const { data: ownerMember } = await service
      .from("household_members")
      .select("user_id")
      .eq("household_id", contact.household_id)
      .eq("role", "owner")
      .single();
    const { data: ownerProfile } = ownerMember
      ? await service.from("profiles").select("email").eq("id", ownerMember.user_id).single()
      : { data: null };
    if (ownerProfile?.email) {
      const releaseStr = releaseAt.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
      await sendEmail({
        to: ownerProfile.email,
        subject: "Emergency access requested for your KinWillow vault",
        html: brandedEmail({
          heading: "Emergency access has been requested",
          bodyHtml:
            `<p>Your trusted contact <strong>${contact.name}</strong> has requested emergency access to your KinWillow vault (reason given: ${requestClass === "death" ? "death of the account owner" : "incapacity of the account owner"}).</p>` +
            (reason ? `<p style="color:#55534a;">“${reason.replace(/</g, "&lt;")}”</p>` : "") +
            `<p><strong>Nothing has been shared.</strong> Under your settings, the waiting period ends <strong>${releaseStr}</strong>. If this request is wrong, sign in and veto it before then — a veto stops it completely.</p>`,
          ctaLabel: "Review the request",
          ctaUrl: "https://www.kinwillow.com/app/emergency",
          footnote: "If you expected this request, no action is needed. KinWillow never shares anything before the waiting period ends.",
        }),
      });
    }
  } catch { /* notification is best-effort */ }

  return NextResponse.json({ ok: true, release_at: request.release_at, waiting_hours: hours });
}
