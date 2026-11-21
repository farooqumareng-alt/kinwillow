import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Login step 3 (only when an authenticator app is switched on): verify the
// 6-digit authenticator code and raise the session to AAL2. Supabase rate
// limits and locks out repeated wrong codes on its side.
export async function POST(req: Request) {
  try {
    const { code } = await req.json().catch(() => ({}));
    const cleanCode = String(code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Your sign-in expired — please start again." }, { status: 401 });
    }
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (factorsError || !factor) {
      return NextResponse.json({ ok: false, error: "No authenticator app is set up for this account." }, { status: 400 });
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode });
    if (error) {
      return NextResponse.json({ ok: false, error: "That code didn't work — check your authenticator app and try again." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
