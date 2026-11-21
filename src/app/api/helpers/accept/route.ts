import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionState } from "@/lib/session";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { clientIp, withinLimits, tooManyRequests, HOUR } from "@/lib/rate-limit";
import { ownerEmail } from "@/lib/release";

// A signed-in user accepts an invitation to help with someone's vault. The
// invitation only works for the address it was sent to, so a forwarded or
// intercepted link is useless to anyone else.
export async function POST(req: Request) {
  if (!(await withinLimits([{ action: "helper-accept:ip", subject: clientIp(req), limit: 20, windowSeconds: HOUR }]))) {
    return tooManyRequests();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || (await getSessionState(supabase)) !== "ok") {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: "This invitation link is not valid." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: invite } = await service
    .from("household_invites")
    .select("id, household_id, email, grant_level, expires_at, accepted_at, revoked_at, households ( name )")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .maybeSingle();
  if (!invite || invite.revoked_at) {
    return NextResponse.json({ error: "This invitation is no longer valid. Ask the owner to send a new one." }, { status: 404 });
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invitation was sent to a different address. Sign in as ${invite.email} to accept it.`, wrong_account: true },
      { status: 403 }
    );
  }
  const householdName = (invite as unknown as { households: { name: string } | null }).households?.name ?? "the vault";
  if (invite.accepted_at) {
    return NextResponse.json({ ok: true, household_id: invite.household_id, household_name: householdName });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired. Ask the owner to send a new one." }, { status: 410 });
  }

  const { data: existing } = await service
    .from("household_members")
    .select("role")
    .eq("household_id", invite.household_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    const { error } = await service.from("household_members").insert({
      household_id: invite.household_id,
      user_id: user.id,
      role: "proxy",
      grant_level: invite.grant_level,
    });
    if (error) {
      console.error(`[helpers] could not add helper to household ${invite.household_id}`, error.message);
      return NextResponse.json({ error: "Could not accept the invitation. Please try again." }, { status: 500 });
    }
  }
  await service.from("household_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  await service.rpc("append_audit", {
    p_household: invite.household_id,
    p_actor: user.id,
    p_action: "helper.joined",
    p_entity: "household_invite",
    p_entity_id: invite.id,
  });

  // Tell the owner, so access to their vault never changes silently.
  const to = await ownerEmail(service, invite.household_id);
  if (to) {
    await sendEmail({
      to,
      subject: `${user.email} now helps with your KinWillow vault`,
      html: brandedEmail({
        heading: "A helper accepted your invitation",
        bodyHtml:
          `<p><strong>${escapeHtml(user.email)}</strong> accepted your invitation and can now ${invite.grant_level === "edit" ? "see your vault and add or correct things in it" : "see your vault, but not change it"}.</p>` +
          "<p>You stay the owner. You can remove them at any time from the Helpers page.</p>" +
          "<p><strong>If you did not invite this person</strong>, remove them now and change your password.</p>",
        ctaLabel: "Open the Helpers page",
        ctaUrl: `${siteUrl()}/app/helpers`,
      }),
    });
  }
  return NextResponse.json({ ok: true, household_id: invite.household_id, household_name: householdName });
}
