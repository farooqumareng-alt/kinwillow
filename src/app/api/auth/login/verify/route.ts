import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { hashLoginCode, hashEquals } from "@/lib/login-code";

// Login step 2: verify the 6-digit code, then — and only then — establish
// the real session. Errors are deliberately generic: the response never
// distinguishes "no code" from "wrong code" from "expired".
const GENERIC_CODE_ERROR = "That code didn't work — please request a new code and try again.";
const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  try {
    const { email, password, code } = await req.json().catch(() => ({}));
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    const cleanCode = String(code || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !cleanPassword || !/^\d{6}$/.test(cleanCode)) {
      return NextResponse.json({ ok: false, error: GENERIC_CODE_ERROR }, { status: 400 });
    }
    const service = createServiceClient();
    const nowIso = new Date().toISOString();
    const { data: rows } = await service
      .from("login_codes")
      .select("id, code_hash, attempts")
      .eq("email", cleanEmail)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (!row || !hashEquals(hashLoginCode(cleanCode, cleanEmail), row.code_hash)) {
      if (row) {
        const attempts = (row.attempts ?? 0) + 1;
        await service
          .from("login_codes")
          .update({
            attempts,
            ...(attempts >= MAX_ATTEMPTS ? { used_at: new Date().toISOString() } : {}),
          })
          .eq("id", row.id);
        if (attempts >= MAX_ATTEMPTS) {
          return NextResponse.json(
            { ok: false, error: "Too many wrong codes — please sign in again to get a new code." },
            { status: 429 }
          );
        }
      }
      return NextResponse.json({ ok: false, error: GENERIC_CODE_ERROR }, { status: 400 });
    }
    await service.from("login_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    // Code verified — now establish the real session. signInWithPassword
    // re-checks the password, so a code alone can never open an account.
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
    if (error) {
      return NextResponse.json({ ok: false, error: "Email or password is incorrect." }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
