import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendEmail } from "@/lib/email";
import { generateLoginCode, hashLoginCode } from "@/lib/login-code";

// Login step 1: check email + password, then email a 6-digit code. No
// session is created here — the session only exists after the code is
// verified (see /api/auth/login/verify).
const GENERIC_CREDENTIALS_ERROR = "Email or password is incorrect.";
const MAX_SENDS_PER_HOUR = 5;

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json().catch(() => ({}));
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !cleanPassword) {
      return NextResponse.json({ ok: false, error: GENERIC_CREDENTIALS_ERROR }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ ok: false, error: "Sign-in is not configured." }, { status: 500 });
    }
    // Validate the password with a throwaway anon client. persistSession is
    // off and the client is discarded, so no session is ever stored; the
    // just-issued token is revoked immediately as a belt-and-braces step.
    const anon = createSupabaseClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: GENERIC_CREDENTIALS_ERROR }, { status: 401 });
    }
    await anon.auth.signOut().catch(() => {});

    const service = createServiceClient();
    // Rate limit: max 5 code sends per email per hour.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await service
      .from("login_codes")
      .select("id", { count: "exact", head: true })
      .eq("email", cleanEmail)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
      return NextResponse.json({ ok: false, error: "Too many sign-in codes requested — please try again later." }, { status: 429 });
    }
    // Invalidate any prior unused codes for this email. Rows are kept (not
    // deleted) so the hourly send count above stays accurate.
    await service
      .from("login_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("email", cleanEmail)
      .is("used_at", null);

    const code = generateLoginCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: insertError } = await service.from("login_codes").insert({
      email: cleanEmail,
      code_hash: hashLoginCode(code, cleanEmail),
      expires_at: expiresAt,
    });
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not start sign-in." }, { status: 502 });
    }
    const sent = await sendEmail({
      to: cleanEmail,
      from: "KinWillow <no-reply@kinwillow.com>",
      subject: "Your KinWillow sign-in code",
      html: brandedEmail({
        heading: "Your KinWillow sign-in code",
        bodyHtml:
          `<p>Your KinWillow sign-in code is:</p><p style="font-size:30px;letter-spacing:6px;color:#1f4030;text-align:center;margin:20px 0;"><strong>${code}</strong></p>` +
          "<p>Enter it on the KinWillow sign-in page to finish signing in. The code expires in 15 minutes.</p>",
        footnote:
          "If you didn't try to sign in, you can safely ignore this email — your password alone can't open your vault.",
      }),
      text:
        `Your KinWillow sign-in code is ${code}\n\n` +
        "Enter it on the KinWillow sign-in page to finish signing in. The code expires in 15 minutes.\n\n" +
        "If you didn't try to sign in, you can safely ignore this email.\n",
    });
    if (!sent) {
      return NextResponse.json({ ok: false, error: "We couldn't send the sign-in code — please try again shortly." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
