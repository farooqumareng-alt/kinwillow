// The staff actions that take two people, written so they can run either
// straight away (when there is no second person to ask) or later, when a
// second staff member approves. Server-side only.
import { logStaffAction, type StaffContext } from "@/lib/admin";
import { isStaffRole, ROLE_INFO, rolesWith, type Permission, type StaffRole } from "@/lib/staff";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { ownerEmail } from "@/lib/release";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult = { ok: true } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): ActionResult => ({ ok: false, error, status });

export type Prepared = {
  payload: Record<string, unknown>;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  /** One sentence a second person can approve from, e.g. "Give sam@x.com the Support role". */
  summary: string;
};

type StaffProfile = { user_id: string; email: string | null; staff_role?: string | null };

/** Other staff who hold this permission — the people who could approve. */
export async function otherHolders(service: SupabaseClient, permission: Permission, exceptUserId: string): Promise<StaffProfile[]> {
  const { data } = await service.from("profiles").select("*").in("staff_role", rolesWith(permission));
  return ((data ?? []) as StaffProfile[]).filter((p) => p.user_id !== exceptUserId);
}

async function audit(ctx: StaffContext, householdId: string | null, name: string, entity: string, entityId: string | null) {
  await ctx.service.rpc("append_audit", {
    p_household: householdId,
    p_actor: ctx.user.id,
    p_action: `admin.${name}`,
    p_entity: entity,
    p_entity_id: entityId,
  });
}

// ---------- staff role ----------

export async function prepareStaffRole(ctx: StaffContext, body: Record<string, unknown>): Promise<Prepared | ActionResult> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const rawRole = body.role;
  if (rawRole !== null && rawRole !== "" && !isStaffRole(rawRole)) return fail("Invalid role");
  const role: StaffRole | null = isStaffRole(rawRole) ? rawRole : null;
  const { data: found } = await ctx.service.from("profiles").select("*").ilike("email", email).limit(2);
  const matches = (found ?? []) as StaffProfile[];
  if (!email || matches.length !== 1) {
    return fail("No KinWillow account uses that email. Ask them to sign up first, then add them here.", 404);
  }
  const target = matches[0];
  if (target.staff_role === undefined) {
    return fail("Staff roles aren't set up in the database yet. Run the staff-roles migration first.", 409);
  }
  if (target.user_id === ctx.user.id) return fail("You can't change your own role. Ask another owner.");
  if ((target.staff_role ?? null) === role) return fail("They already have that role.");
  return {
    payload: { user_id: target.user_id, role },
    targetType: "account",
    targetId: target.user_id,
    targetLabel: target.email,
    summary: role
      ? `Give ${target.email} the ${ROLE_INFO[role].label} role${target.staff_role ? ` (now ${target.staff_role})` : ""}`
      : `Remove staff access from ${target.email}`,
  };
}

export async function applyStaffRole(ctx: StaffContext, payload: Record<string, unknown>, reason: string): Promise<ActionResult> {
  const userId = String(payload.user_id ?? "");
  const role: StaffRole | null = isStaffRole(payload.role) ? payload.role : null;
  const { service } = ctx;
  const { data } = await service.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  const target = data as StaffProfile | null;
  if (!target) return fail("That account no longer exists.", 404);
  if (target.staff_role === "owner" && role !== "owner") {
    const { count } = await service.from("profiles").select("user_id", { count: "exact", head: true }).eq("staff_role", "owner");
    if ((count ?? 0) <= 1) return fail("This is the only owner. Make someone else an owner first.");
  }
  // The log line is written first: a role never changes without a record.
  const logged = await logStaffAction(ctx, {
    action: role ? `staff.role.${role}` : "staff.removed",
    targetType: "account",
    targetId: userId,
    targetLabel: target.email,
    reason,
  });
  if (!logged) return fail("The staff log couldn't be written, so nothing was changed.", 500);
  const { error } = await service.from("profiles").update({ staff_role: role, is_admin: role !== null }).eq("user_id", userId);
  if (error) return fail(error.message);
  await audit(ctx, null, role ? `staff_role_${role}` : "staff_removed", "profile", userId);
  if (target.email) {
    await sendEmail({
      to: target.email,
      subject: role ? "You've been given KinWillow staff access" : "Your KinWillow staff access has been removed",
      html: brandedEmail({
        heading: role ? "You now have KinWillow staff access" : "Your KinWillow staff access has been removed",
        bodyHtml: role
          ? `<p>Your role is <strong>${ROLE_INFO[role].label}</strong>: ${ROLE_INFO[role].summary}</p>` +
            "<p>Staff accounts must use an authenticator app. Turn it on under Security in your vault, then sign in again.</p>"
          : "<p>Your account no longer has access to the KinWillow staff panel. Your own vault is not affected.</p>",
        ...(role ? { ctaLabel: "Open the staff panel", ctaUrl: `${siteUrl()}/admin` } : {}),
      }),
    });
  }
  return { ok: true };
}

// ---------- emergency request: cancel ----------

type RequestRow = { id: string; household_id: string; trusted_contact_id: string; state: string; request_class: string };

export async function loadRequest(service: SupabaseClient, id: string): Promise<{ request: RequestRow; label: string } | null> {
  const { data } = await service.from("disclosure_requests").select("*").eq("id", id).maybeSingle();
  const request = data as RequestRow | null;
  if (!request) return null;
  const { data: household } = await service.from("households").select("name").eq("id", request.household_id).maybeSingle();
  return { request, label: (household as { name?: string } | null)?.name ?? "a household" };
}

export async function prepareReleaseCancel(ctx: StaffContext, body: Record<string, unknown>): Promise<Prepared | ActionResult> {
  const found = await loadRequest(ctx.service, String(body.request_id ?? ""));
  if (!found) return fail("Request not found", 404);
  if (found.request.state !== "waiting") return fail("This request is no longer waiting.", 409);
  return {
    payload: { request_id: found.request.id },
    targetType: "emergency_request",
    targetId: found.request.id,
    targetLabel: found.label,
    summary: `Cancel the emergency request on ${found.label}, so nothing is released`,
  };
}

export async function applyReleaseCancel(ctx: StaffContext, payload: Record<string, unknown>, reason: string): Promise<ActionResult> {
  const { service } = ctx;
  const found = await loadRequest(service, String(payload.request_id ?? ""));
  if (!found) return fail("Request not found", 404);
  const nowIso = new Date().toISOString();
  const { data: changed, error } = await service
    .from("disclosure_requests")
    .update({ state: "vetoed", vetoed_by: ctx.user.id, vetoed_at: nowIso, staff_cancelled_at: nowIso })
    .eq("id", found.request.id)
    .eq("state", "waiting")
    .select("id");
  if (error) return fail(error.message);
  if (!changed || changed.length === 0) return fail("This request is no longer waiting, so nothing was changed.", 409);
  await audit(ctx, found.request.household_id, "release_cancelled", "disclosure_request", found.request.id);
  await logStaffAction(ctx, {
    action: "release.cancelled",
    targetType: "emergency_request",
    targetId: found.request.id,
    targetLabel: found.label,
    reason,
  });

  // Tell both sides. Neither email says why: the reason stays in the staff log.
  const { data: contact } = await service.from("trusted_contacts").select("name, email").eq("id", found.request.trusted_contact_id).maybeSingle();
  const c = contact as { name?: string; email?: string } | null;
  if (c?.email) {
    await sendEmail({
      to: c.email,
      subject: "Your KinWillow emergency request was stopped",
      html: brandedEmail({
        heading: "Your emergency request was stopped",
        bodyHtml:
          `<p>Hello ${escapeHtml(c.name ?? "")},</p>` +
          "<p>After a review, KinWillow has stopped your recent request for emergency access. Nothing was released.</p>" +
          "<p>If you believe this is a mistake, reply to this email and a person will look at it with you.</p>",
      }),
      replyTo: "info@kinwillow.com",
    });
  }
  const owner = await ownerEmail(service, found.request.household_id);
  if (owner) {
    await sendEmail({
      to: owner,
      subject: "KinWillow stopped an emergency request on your vault",
      html: brandedEmail({
        heading: "An emergency request on your vault was stopped",
        bodyHtml:
          "<p>After a review, KinWillow cancelled a trusted contact's request for emergency access to your vault. Nothing was released.</p>" +
          "<p>You can see the request, and every action taken on it, in your vault's activity log.</p>",
        ctaLabel: "Open my vault",
        ctaUrl: `${siteUrl()}/app/emergency`,
      }),
    });
  }
  return { ok: true };
}

export const TWO_PERSON: Record<
  string,
  {
    prepare: (ctx: StaffContext, body: Record<string, unknown>) => Promise<Prepared | ActionResult>;
    apply: (ctx: StaffContext, payload: Record<string, unknown>, reason: string) => Promise<ActionResult>;
    /** True when this particular request is safe to do alone (it only takes access away). */
    soloAllowed?: (payload: Record<string, unknown>) => boolean;
  }
> = {
  staff_set_role: { prepare: prepareStaffRole, apply: applyStaffRole, soloAllowed: (p) => p.role === null },
  release_cancel: { prepare: prepareReleaseCancel, apply: applyReleaseCancel },
};
