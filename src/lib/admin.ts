import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Server-side admin gate (spec §13 rule 2/4): the session must belong to a
// profile flagged is_admin in the database. Returns a service-role client
// for metadata reads, or null when the caller is not an admin.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let service;
  try {
    service = createServiceClient();
  } catch {
    return null;
  }
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin, email")
    .eq("user_id", user.id)
    .single();
  if (!profile?.is_admin) return null;
  return { service, user, email: profile.email as string | null };
}
