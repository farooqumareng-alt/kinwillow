import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markSessionVerified } from "@/lib/session";

// Email links (address confirmation, recovery) land here. Using the link
// proves control of the mailbox, so the resulting session counts as verified
// by email, exactly like entering the emailed sign-in code.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      await markSessionVerified(data.session);
      // Only two destinations are ever allowed — never an arbitrary URL.
      const next = searchParams.get("next") === "/reset-password" ? "/reset-password" : "/app";
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
