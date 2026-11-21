import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionState } from "@/lib/session";
import { brandedEmail, sendEmail, siteUrl } from "@/lib/email";
import { DELETION_GRACE_DAYS, passwordIsCorrect } from "@/lib/account";

// POST   — request deletion of the signed-in account (password re-checked).
//          The vault is deleted by the daily job after the grace period.
// DELETE — cancel a pending deletion.
async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  if ((await getSessionState(supabase)) !== "ok") return null;
  return { id: user.id, email: user.email };
}

export async function POST(req: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!(await passwordIsCorrect(user.email, String(body?.password ?? "")))) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 403 });
  }

  const service = createServiceClient();
  const requestedAt = new Date();
  const { error } = await service
    .from("profiles")
    .update({ deletion_requested_at: requestedAt.toISOString() })
    .eq("user_id", user.id);
  if (error) {
    console.error(`[account] could not schedule deletion for ${user.id}`, error.message);
    return NextResponse.json({ error: "Could not schedule the deletion. Please try again." }, { status: 500 });
  }
  const deleteOn = new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 3600_000);
  const deleteOnText = deleteOn.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

  await sendEmail({
    to: user.email,
    subject: "Your KinWillow account is scheduled for deletion",
    html: brandedEmail({
      heading: "Your account is scheduled for deletion",
      bodyHtml:
        `<p>You asked us to delete your KinWillow account. Your vault, its documents, your trusted contacts and your sign-in will be permanently deleted on or shortly after <strong>${deleteOnText}</strong>. Any paid plan is cancelled at that point.</p>` +
        "<p>Until then nothing changes: you can sign in, download an export, or cancel the deletion from Settings.</p>" +
        "<p><strong>If you did not ask for this</strong>, sign in now, cancel the deletion in Settings, and change your password.</p>",
      ctaLabel: "Open Settings",
      ctaUrl: `${siteUrl()}/app/settings`,
    }),
  });

  return NextResponse.json({ ok: true, delete_on: deleteOn.toISOString() });
}

export async function DELETE() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("user_id", user.id);
  if (error) {
    console.error(`[account] could not cancel deletion for ${user.id}`, error.message);
    return NextResponse.json({ error: "Could not cancel the deletion. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
