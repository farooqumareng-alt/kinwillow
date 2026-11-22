import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionState } from "@/lib/session";
import { can, isStaffRole, type Permission, type StaffRole } from "@/lib/staff";

// Server-side gate for the admin panel. To get in, a person needs:
//   1. a fully signed-in session (password + emailed code),
//   2. a staff role on their profile, and
//   3. an authenticator app, used for this session.
// Staff pages read through the service role, which bypasses row-level
// security, so all three checks are made here on every request.

export type StaffContext = {
  status: "ok";
  service: SupabaseClient;
  user: User;
  email: string | null;
  role: StaffRole;
};
export type StaffGate = StaffContext | { status: "denied" } | { status: "needs_mfa" };

export async function staffGate(): Promise<StaffGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "denied" };
  if ((await getSessionState(supabase)) !== "ok") return { status: "denied" };
  let service: SupabaseClient;
  try {
    service = createServiceClient();
  } catch {
    return { status: "denied" };
  }
  // "*" so this still works before the staff_role column exists.
  const { data: profile } = await service.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  const p = profile as { is_admin?: boolean; staff_role?: string | null; email?: string | null } | null;
  // Until the staff-roles migration has been run, an existing admin is the owner.
  const role: StaffRole | null = isStaffRole(p?.staff_role) ? p.staff_role : p?.is_admin && p?.staff_role === undefined ? "owner" : null;
  if (!role) return { status: "denied" };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { status: "needs_mfa" };

  return { status: "ok", service, user, email: p?.email ?? user.email ?? null, role };
}

/** For API routes: the staff context if the caller holds the permission, else null. */
export async function requireStaff(permission: Permission): Promise<StaffContext | null> {
  const gate = await staffGate();
  if (gate.status !== "ok" || !can(gate.role, permission)) return null;
  return gate;
}

/**
 * Record something staff did in the customer's own activity log (one entry
 * per vault they own), so the customer can see it. Never throws.
 */
export async function auditForCustomer(ctx: StaffContext, customerUserId: string, name: string): Promise<void> {
  try {
    const { data } = await ctx.service.from("households").select("id").eq("owner_id", customerUserId);
    for (const h of (data ?? []) as Array<{ id: string }>) {
      await ctx.service.rpc("append_audit", {
        p_household: h.id,
        p_actor: ctx.user.id,
        p_action: `admin.${name}`,
        p_entity: "profile",
        p_entity_id: customerUserId,
      });
    }
  } catch (err) {
    console.error("[staff] could not write to the customer's activity log", err);
  }
}

/**
 * Write one line to the staff log: who, what, to whom, why. Never throws —
 * but callers that change something should check the result and refuse to
 * proceed when the log cannot be written.
 */
export async function logStaffAction(
  ctx: StaffContext,
  entry: { action: string; targetType?: string; targetId?: string | null; targetLabel?: string | null; reason?: string | null }
): Promise<boolean> {
  const { error } = await ctx.service.from("staff_actions").insert({
    actor_id: ctx.user.id,
    actor_email: ctx.email,
    actor_role: ctx.role,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    target_label: entry.targetLabel ?? null,
    reason: entry.reason ?? null,
  });
  if (error) console.error("[staff] could not write the staff log:", error.message);
  return !error;
}
