import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Password reset, step 1 (POST { email }): send the recovery email. The
// response is identical whether or not the address has an account.
// Step 2 (PUT { password, code? }): set the new password. Requires the
// session created by the recovery link; when an authenticator app is
// switched on, its code is required too.
const MIN_LENGTH = 10;

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const supabase = await createClient();
    const origin = new URL(req.url).origin;
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      // Only used if the Supabase recovery template still links with
      // {{ .ConfirmationURL }}; supabase/templates/recovery.html links to
      // /auth/confirm with a token hash instead, which also works when the
      // email is opened on another device.
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    // Supabase rate-limits these itself; log anything else for the operator.
    if (error) console.error("[auth] password reset email was not sent:", error.message);
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  try {
    const { password, code } = await req.json().catch(() => ({}));
    const newPassword = String(password || "");
    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json({ ok: false, error: `Use at least ${MIN_LENGTH} characters.` }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "This reset link has expired. Please request a new one." },
        { status: 401 }
      );
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const cleanCode = String(code || "").replace(/\s/g, "");
      if (!/^\d{6}$/.test(cleanCode)) {
        return NextResponse.json(
          { ok: false, mfa_required: true, error: "Enter the 6-digit code from your authenticator app." },
          { status: 400 }
        );
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      const verify = factor
        ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode })
        : { error: new Error("no factor") };
      if (verify.error) {
        return NextResponse.json(
          { ok: false, mfa_required: true, error: "That authenticator code didn't work — please try again." },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

// Tells the reset page whether to ask for an authenticator code.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signed_in: false, mfa_required: false });
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return NextResponse.json({
    signed_in: true,
    mfa_required: aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2",
  });
}
