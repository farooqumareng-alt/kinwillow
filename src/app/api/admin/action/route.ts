import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { logStaffAction, staffGate } from "@/lib/admin";
import { can, isStaffRole, ROLE_INFO, type Permission, type StaffRole } from "@/lib/staff";
import { sendConfirmationLinkEmail, sendPasswordResetEmail } from "@/lib/auth-emails";
import { brandedEmail, sendEmail, siteUrl } from "@/lib/email";

// Every change staff make goes through this one route. For each action it
// checks the caller's role, requires a written reason, and records the change
// in the staff log (and in the household's own audit log where one applies).
// Metadata only — this route never touches vault contents.

const NEEDS: Record<string, Permission> = {
  set_plan: "billing.manage",
  set_status: "billing.manage",
  set_partner: "partners.manage",
  inbox_state: "inbox.manage",
  staff_set_role: "staff.manage",
  send_reset: "accounts.support",
  send_confirmation: "accounts.support",
};
const NO_REASON_NEEDED = new Set(["inbox_state"]);

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return bad("Not available", 404);
  const { service, user } = ctx;

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  const needed = NEEDS[action];
  if (!needed) return bad("Unknown action");
  if (!can(ctx.role, needed)) return bad("Your staff role doesn't allow this.", 403);

  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!NO_REASON_NEEDED.has(action) && reason.length < 3) {
    return bad("Please give a short reason. It is recorded in the staff log.");
  }

  async function audit(householdId: string | null, name: string, entity: string, entityId: string | null) {
    await service.rpc("append_audit", {
      p_household: householdId,
      p_actor: user.id,
      p_action: `admin.${name}`,
      p_entity: entity,
      p_entity_id: entityId,
    });
  }
  async function householdLabel(id: string): Promise<string | null> {
    const { data } = await service.from("households").select("name").eq("id", id).maybeSingle();
    return (data as { name?: string } | null)?.name ?? null;
  }
  async function profileOf(userId: string) {
    const { data } = await service.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    return data as { user_id: string; email: string | null; partner_code?: string | null; staff_role?: string | null } | null;
  }

  if (action === "set_plan") {
    const householdId = String(body.household_id ?? "");
    const tier = String(body.tier ?? "");
    if (!["free", "family", "family_parents"].includes(tier)) return bad("Invalid plan");
    const label = await householdLabel(householdId);
    if (label === null) return bad("Household not found", 404);
    const { error } = await service.from("households").update({ plan_tier: tier }).eq("id", householdId);
    if (error) return bad(error.message);
    await audit(householdId, `set_plan_${tier}`, "household", householdId);
    await logStaffAction(ctx, { action: `plan.set.${tier}`, targetType: "household", targetId: householdId, targetLabel: label, reason });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_status") {
    const householdId = String(body.household_id ?? "");
    const status = String(body.status ?? "");
    if (!["active", "sealed"].includes(status)) return bad("Invalid status");
    const label = await householdLabel(householdId);
    if (label === null) return bad("Household not found", 404);
    const { error } = await service.from("households").update({ status }).eq("id", householdId);
    if (error) return bad(error.message);
    await audit(householdId, `household_${status}`, "household", householdId);
    await logStaffAction(ctx, { action: `household.${status}`, targetType: "household", targetId: householdId, targetLabel: label, reason });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_partner") {
    const userId = String(body.user_id ?? "");
    const makePartner = body.is_partner === true;
    const profile = userId ? await profileOf(userId) : null;
    if (!profile) return bad("User not found", 404);
    // A code is issued once and kept, so links already shared keep working if
    // partner status is removed and later restored.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = profile.partner_code ?? Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
    const { error } = await service.from("profiles").update({ is_partner: makePartner, partner_code: code }).eq("user_id", userId);
    if (error) return bad(error.message);
    await audit(null, makePartner ? "partner_granted" : "partner_removed", "profile", userId);
    await logStaffAction(ctx, {
      action: makePartner ? "partner.granted" : "partner.removed",
      targetType: "account",
      targetId: userId,
      targetLabel: profile.email,
      reason,
    });
    return NextResponse.json({ ok: true, partner_code: code });
  }

  if (action === "inbox_state") {
    const table = String(body.table ?? "");
    const id = String(body.id ?? "");
    if (!["messages", "signups"].includes(table) || !id) return bad("Invalid inbox target");
    const patch: Record<string, string | null> = {};
    if (typeof body.read === "boolean") patch.read_at = body.read ? new Date().toISOString() : null;
    if (typeof body.archived === "boolean") patch.archived_at = body.archived ? new Date().toISOString() : null;
    const { error } = await service.from(table).update(patch).eq("id", id);
    if (error) return bad(error.message);
    await audit(null, `inbox_${table}_state`, table, id);
    return NextResponse.json({ ok: true });
  }

  if (action === "staff_set_role") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const rawRole: unknown = body.role;
    if (rawRole !== null && rawRole !== "" && !isStaffRole(rawRole)) return bad("Invalid role");
    const role: StaffRole | null = isStaffRole(rawRole) ? rawRole : null;
    const { data: found } = await service.from("profiles").select("*").ilike("email", email).limit(2);
    const matches = (found ?? []) as Array<{ user_id: string; email: string | null; staff_role?: string | null }>;
    if (matches.length !== 1) {
      return bad("No KinWillow account uses that email. Ask them to sign up first, then add them here.", 404);
    }
    const target = matches[0];
    if (target.staff_role === undefined) {
      return bad("Staff roles aren't set up in the database yet. Run the staff-roles migration first.", 409);
    }
    if (target.user_id === user.id) return bad("You can't change your own role. Ask another owner.");
    if (target.staff_role === "owner" && role !== "owner") {
      const { count } = await service.from("profiles").select("user_id", { count: "exact", head: true }).eq("staff_role", "owner");
      if ((count ?? 0) <= 1) return bad("This is the only owner. Make someone else an owner first.");
    }
    // The log line is written first: a role never changes without a record.
    const logged = await logStaffAction(ctx, {
      action: role ? `staff.role.${role}` : "staff.removed",
      targetType: "account",
      targetId: target.user_id,
      targetLabel: target.email,
      reason,
    });
    if (!logged) return bad("The staff log couldn't be written, so nothing was changed.", 500);
    const { error } = await service.from("profiles").update({ staff_role: role, is_admin: role !== null }).eq("user_id", target.user_id);
    if (error) return bad(error.message);
    await audit(null, role ? `staff_role_${role}` : "staff_removed", "profile", target.user_id);
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
    return NextResponse.json({ ok: true });
  }

  if (action === "send_reset" || action === "send_confirmation") {
    const userId = String(body.user_id ?? "");
    const profile = userId ? await profileOf(userId) : null;
    if (!profile?.email) return bad("User not found", 404);
    const sent =
      action === "send_reset" ? await sendPasswordResetEmail(profile.email) : await sendConfirmationLinkEmail(profile.email);
    await logStaffAction(ctx, {
      action: `${action === "send_reset" ? "email.password_reset" : "email.confirmation"}${sent ? "" : ".failed"}`,
      targetType: "account",
      targetId: userId,
      targetLabel: profile.email,
      reason,
    });
    if (!sent) return bad("The email could not be sent. Please try again shortly.", 502);
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action");
}
