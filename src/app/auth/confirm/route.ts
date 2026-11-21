import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { markSessionVerified } from "@/lib/session";

// Email links that carry a token hash (password recovery, address
// confirmation) land here. Unlike /auth/callback this works when the link is
// opened on a different device or browser from the one that requested it.
// Template link:  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
const ALLOWED: EmailOtpType[] = ["recovery", "signup", "email", "email_change", "invite", "magiclink"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.session) {
      // Using the link proves control of the mailbox, like the emailed code.
      await markSessionVerified(data.session);
      return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : "/app"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
