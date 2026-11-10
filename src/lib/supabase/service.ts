import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — server-side ONLY, for flows that cannot run under a
// user session: the public trusted-contact request page, package access,
// the Stripe webhook, and the admin panel. Never import from client code.
export function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Service role is not configured");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export function serviceConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
