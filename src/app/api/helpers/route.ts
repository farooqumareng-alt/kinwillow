import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { withinLimits, tooManyRequests, DAY } from "@/lib/rate-limit";

// Helpers: people the owner invites to help manage a vault (for example a
// daily money manager, organiser or adult child). A helper is a household
// member with role "proxy" and a view or edit grant.
//   GET    ?household_id=…                 owner: list helpers and open invitations
//   POST   { household_id, email, grant }  owner: invite
//   DELETE { household_id, user_id }       owner removes a helper, or a helper leaves
//   DELETE { household_id, invite_id }     owner withdraws an invitation
const MAX_HELPERS = 5;
const INVITE_VALID_DAYS = 14;

const hashInviteToken =(token: string) => createHash("sha256").update(token).digest("hex");

async function caller(householdId: string | undefined | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !householdId) return null;
  // Read through the user's own session, so row-level security (including the
  // completed-sign-in check) vouches for the membership.
  const { data: membership } = await supabase
    .from("household_members")
    .select("role, households ( name )")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return null;
  return {
    user,
    role: membership.role as string,
    householdName: (membership as unknown as { households: { name: string } | null }).households?.name ?? "a household",
  };
}

export async function GET(req: Request) {
  const householdId = new URL(req.url).searchParams.get("household_id");
  const me = await caller(householdId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "owner") return NextResponse.json({ error: "Only the owner can see who helps with this vault." }, { status: 403 });

  const service = createServiceClient();
  const { data: members } = await service
    .from("household_members")
    .select("user_id, role, grant_level, created_at")
    .eq("household_id", householdId)
    .neq("role", "owner");
  const helpers = [];
  for (const m of (members ?? []) as Array<{ user_id: string; role: string; grant_level: string; created_at: string }>) {
    const { data } = await service.auth.admin.getUserById(m.user_id);
    helpers.push({ ...m, email: data?.user?.email ?? "(unknown)" });
  }
  const { data: invites } = await service
    .from("household_invites")
    .select("id, email, grant_level, expires_at, created_at")
    .eq("household_id", householdId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return NextResponse.json({ helpers, invites: invites ?? [], max: MAX_HELPERS });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const householdId = body?.household_id as string | undefined;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const grant = body?.grant === "view" ? "view" : "edit";
  const me = await caller(householdId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "owner") return NextResponse.json({ error: "Only the owner can invite a helper." }, { status: 403 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the helper's email address." }, { status: 400 });
  }
  if (email === (me.user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "That is your own address — you already own this vault." }, { status: 400 });
  }
  if (!(await withinLimits([{ action: "helper-invite", subject: householdId!, limit: 10, windowSeconds: DAY }]))) {
    return tooManyRequests("You've sent several invitations today. Please try again tomorrow.");
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
    service.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", householdId).neq("role", "owner"),
    service
      .from("household_invites")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso),
  ]);
  if ((memberCount ?? 0) + (inviteCount ?? 0) >= MAX_HELPERS) {
    return NextResponse.json(
      { error: `A vault can have up to ${MAX_HELPERS} helpers, counting open invitations. Remove one first.` },
      { status: 409 }
    );
  }
  // One open invitation per address: a new one replaces the old.
  await service
    .from("household_invites")
    .update({ revoked_at: nowIso })
    .eq("household_id", householdId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 3600_000);
  const { data: invite, error } = await service
    .from("household_invites")
    .insert({
      household_id: householdId,
      email,
      grant_level: grant,
      token_hash: hashInviteToken(token),
      invited_by: me.user.id,
      expires_at: expires.toISOString(),
    })
    .select("id")
    .single();
  if (error || !invite) {
    console.error(`[helpers] could not create an invitation for household ${householdId}`, error?.message);
    return NextResponse.json({ error: "Could not create the invitation. Please try again." }, { status: 500 });
  }

  const { data: profile } = await service.from("profiles").select("display_name").eq("user_id", me.user.id).maybeSingle();
  const ownerName = profile?.display_name?.trim() || me.user.email || "A KinWillow user";
  const link = `${siteUrl()}/app/accept-invite/${token}`;
  const can = grant === "edit" ? "see it and add or correct things in it" : "see it, but not change anything";
  const sent = await sendEmail({
    to: email,
    replyTo: me.user.email ?? undefined,
    subject: `${ownerName} invited you to help with their KinWillow vault`,
    html: brandedEmail({
      heading: "You've been invited to help with a vault",
      bodyHtml:
        `<p><strong>${escapeHtml(ownerName)}</strong> has invited you to help manage “${escapeHtml(me.householdName)}” on KinWillow — the place where they keep a map of their accounts, documents and instructions for their family.</p>` +
        `<p>If you accept, you will be able to ${can}. They stay the owner and can remove you at any time. Only they can decide when anything is released to their family.</p>` +
        `<p>To accept, sign in to KinWillow <strong>with this email address</strong> (${escapeHtml(email)}) and open the link below. If you don't have a KinWillow account yet, create a free one with this address first, then come back to this email.</p>`,
      ctaLabel: "Accept the invitation",
      ctaUrl: link,
      footnote: `This invitation expires in ${INVITE_VALID_DAYS} days and only works for ${escapeHtml(email)}. If you weren't expecting it, you can ignore this email.`,
    }),
  });
  if (!sent) {
    await service.from("household_invites").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
    return NextResponse.json({ error: "We couldn't send the invitation email. Please try again in a moment." }, { status: 502 });
  }
  await service.rpc("append_audit", {
    p_household: householdId,
    p_actor: me.user.id,
    p_action: "helper.invited",
    p_entity: "household_invite",
    p_entity_id: invite.id,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const householdId = body?.household_id as string | undefined;
  const me = await caller(householdId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const service = createServiceClient();

  if (body?.invite_id) {
    if (me.role !== "owner") return NextResponse.json({ error: "Only the owner can withdraw an invitation." }, { status: 403 });
    const { error } = await service
      .from("household_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.invite_id)
      .eq("household_id", householdId);
    if (error) return NextResponse.json({ error: "Could not withdraw the invitation." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const targetId = body?.user_id as string | undefined;
  if (!targetId) return NextResponse.json({ error: "user_id or invite_id is required" }, { status: 400 });
  const leaving = targetId === me.user.id;
  if (!leaving && me.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can remove a helper." }, { status: 403 });
  }
  // An owner can never be removed this way — including by themselves.
  const { data: removed, error } = await service
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", targetId)
    .neq("role", "owner")
    .select("user_id");
  if (error) return NextResponse.json({ error: "Could not remove the helper." }, { status: 500 });
  if (!removed || removed.length === 0) {
    return NextResponse.json({ error: "That person is not a helper on this vault." }, { status: 404 });
  }
  await service.rpc("append_audit", {
    p_household: householdId,
    p_actor: me.user.id,
    p_action: leaving ? "helper.left" : "helper.removed",
    p_entity: "household",
    p_entity_id: householdId,
  });
  return NextResponse.json({ ok: true });
}
