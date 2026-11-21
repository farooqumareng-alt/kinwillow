import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";

// Owner action: email a trusted contact their personal link, with a plain
// explanation of what it is for. Can be re-sent, at most once every 10 minutes.
const RESEND_WAIT_MS = 10 * 60_000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const contactId = body?.contact_id as string | undefined;
  if (!contactId) return NextResponse.json({ error: "contact_id is required" }, { status: 400 });

  // Read through the user's own session: row-level security proves membership.
  const { data: contact } = await supabase
    .from("trusted_contacts")
    .select("id, household_id, name, email, status, request_token, invited_at")
    .eq("id", contactId)
    .single();
  if (!contact || contact.status === "removed") {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const { data: canEdit } = await supabase.rpc("has_member_edit", { hid: contact.household_id });
  if (!canEdit) return NextResponse.json({ error: "You cannot invite contacts for this household" }, { status: 403 });
  if (contact.invited_at && Date.now() - new Date(contact.invited_at).getTime() < RESEND_WAIT_MS) {
    return NextResponse.json(
      { error: "An invitation was just sent. Please wait a few minutes before sending another." },
      { status: 429 }
    );
  }

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  const ownerName = escapeHtml(profile?.display_name?.trim() || "Someone who trusts you");
  const link = `${siteUrl()}/request-access/${contact.request_token}`;

  const sent = await sendEmail({
    to: contact.email,
    replyTo: user.email ?? undefined,
    subject: `${profile?.display_name?.trim() || "Someone"} named you as a trusted contact on KinWillow`,
    html: brandedEmail({
      heading: "You've been named as a trusted contact",
      bodyHtml:
        `<p>${escapeHtml(contact.name)}, <strong>${ownerName}</strong> has chosen you as a trusted contact for their KinWillow vault — the place where they keep a map of their accounts, documents and instructions for the people they trust.</p>` +
        "<p><strong>There is nothing you need to do today</strong> except keep this email, or save the link below somewhere you will find it.</p>" +
        "<p>If something ever happens to them — they die, or cannot act for themselves — open your personal link and request access. They are notified and given time to stop the request if it was a mistake. If they don't, the information they prepared for you is sent to you automatically.</p>" +
        "<p>KinWillow never holds their passwords, and you cannot see anything in their vault in the meantime.</p>",
      ctaLabel: "Open my personal link",
      ctaUrl: link,
      footnote:
        "This link is personal to you — please don't forward it. If you don't know the sender, you can ignore this email; nothing happens unless you use the link.",
    }),
    text:
      `${contact.name}, ${profile?.display_name?.trim() || "someone who trusts you"} has named you as a trusted contact for their KinWillow vault.\n\n` +
      "There is nothing you need to do today except keep this email.\n\n" +
      "If something ever happens to them, open your personal link and request access. They are notified and given time to stop the request; if they don't, the information they prepared for you is sent to you automatically.\n\n" +
      `Your personal link (please don't forward it): ${link}\n`,
  });
  if (!sent) {
    return NextResponse.json(
      { error: "We couldn't send the invitation just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const invitedAt = new Date().toISOString();
  const { error } = await createServiceClient()
    .from("trusted_contacts")
    .update({ invited_at: invitedAt })
    .eq("id", contact.id);
  if (error) console.error(`[contacts] invitation sent but not recorded for ${contact.id}`, error.message);
  return NextResponse.json({ ok: true, invited_at: invitedAt });
}
