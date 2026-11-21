// Account deletion. Requested from Settings (password re-checked), carried
// out by the daily job after a 30-day grace period. Server-side only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const DELETION_GRACE_DAYS = 30;

/** Re-check a password without creating a usable session. */
export async function passwordIsCorrect(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !password) return false;
  const anon = createSupabaseClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;
  await anon.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}

/**
 * Permanently delete a user and every household they own: cancels billing,
 * removes uploaded files, then the database rows (which cascade), then the
 * sign-in account. Throws if any step fails, so the job retries tomorrow
 * rather than leaving a half-deleted account unnoticed.
 */
export async function deleteAccount(service: SupabaseClient, userId: string): Promise<void> {
  const { data: households, error } = await service.from("households").select("id").eq("owner_id", userId);
  if (error) throw new Error(`could not list households: ${error.message}`);
  const householdIds = (households ?? []).map((h: { id: string }) => h.id);

  for (const hid of householdIds) {
    // 1. Stop billing first: never keep charging for a deleted vault.
    const { data: sub } = await service
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("household_id", hid)
      .maybeSingle();
    if (sub?.stripe_subscription_id && sub.status !== "canceled") {
      if (!stripeConfigured()) throw new Error("a subscription exists but Stripe is not configured");
      try {
        await getStripe().subscriptions.cancel(sub.stripe_subscription_id);
      } catch (err) {
        // Already gone at Stripe is fine; anything else must stop the deletion.
        if ((err as { code?: string }).code !== "resource_missing") throw err;
      }
    }

    // 2. Uploaded files (storage objects do not cascade from table rows).
    const { data: docs, error: docsError } = await service
      .from("documents")
      .select("storage_path")
      .eq("household_id", hid);
    if (docsError) throw new Error(`could not list documents: ${docsError.message}`);
    const paths = (docs ?? []).map((d: { storage_path: string }) => d.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: removeError } = await service.storage.from("documents").remove(paths.slice(i, i + 100));
      if (removeError) throw new Error(`could not remove files: ${removeError.message}`);
    }

    // 3. The household row; everything inside it cascades.
    const { error: deleteError } = await service.from("households").delete().eq("id", hid);
    if (deleteError) throw new Error(`could not delete household: ${deleteError.message}`);
  }

  await service.from("verified_sessions").delete().eq("user_id", userId);
  const { error: userError } = await service.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`could not delete the sign-in account: ${userError.message}`);
}
