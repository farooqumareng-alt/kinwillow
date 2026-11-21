// Session verification. A Supabase session only unlocks vault data once it is
// recorded in public.verified_sessions (written here, service role only) —
// which happens after the emailed sign-in code is verified or an email
// confirmation link is used. Row-level security enforces it via
// public.session_state(); see supabase/migrations/…000008 and …000009.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type SessionState = "none" | "needs_code" | "needs_mfa" | "ok";

function sessionIdFromAccessToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Record that this session proved control of the account's email address. */
export async function markSessionVerified(session: { access_token: string; user: { id: string } }): Promise<boolean> {
  const sessionId = sessionIdFromAccessToken(session.access_token);
  if (!sessionId) {
    console.error("[session] access token carries no session_id; session not marked verified");
    return false;
  }
  try {
    const { error } = await createServiceClient()
      .from("verified_sessions")
      .upsert({ session_id: sessionId, user_id: session.user.id }, { onConflict: "session_id" });
    if (error) {
      console.error("[session] could not record the verified session", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[session] could not record the verified session", err);
    return false;
  }
}

/**
 * Ask the database what this session still owes. If the check itself cannot
 * run (the migration is not applied yet), this reports "ok" and logs: the
 * database policies are the real gate, this only decides where to send the
 * browser.
 */
export async function getSessionState(supabase: SupabaseClient): Promise<SessionState> {
  const { data, error } = await supabase.rpc("session_state");
  if (error) {
    console.error("[session] session_state() is unavailable — has migration 000008 been run?", error.message);
    return "ok";
  }
  return (data as SessionState) ?? "none";
}
