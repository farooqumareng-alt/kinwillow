import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auditForCustomer, logStaffAction, staffGate, type StaffContext } from "@/lib/admin";
import { can, NEEDS_SECOND_PERSON, type Permission } from "@/lib/staff";
import { loadRequest, otherHolders, TWO_PERSON, type ActionResult } from "@/lib/staff-actions";
import { sendConfirmationLinkEmail, sendPasswordResetEmail } from "@/lib/auth-emails";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";

// Every change staff make goes through this one route. For each action it
// checks the caller's role, requires a written reason, and records the change
// in the staff log (and in the household's own audit log where one applies).
// The riskiest actions also need a second staff member to approve.
// Metadata only — this route never touches vault contents.

const NEEDS: Record<string, Permission> = {
  set_plan: "billing.manage",
  set_status: "billing.manage",
  set_partner: "partners.manage",
  inbox_state: "inbox.manage",
  send_reset: "accounts.support",
  send_confirmation: "accounts.support",
  release_hold: "releases.manage",
  release_unhold: "releases.manage",
  ...NEEDS_SECOND_PERSON,
};
const NO_REASON_NEEDED = new Set(["inbox_state"]);
/** Lifting a hold always leaves the owner at least this long to act. */
const HOURS_AFTER_HOLD = 24;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const reply = (r: ActionResult) => (r.ok ? NextResponse.json({ ok: true }) : bad(r.error, r.status));

export async function POST(req: Request) {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return bad("Not available", 404);
  const { service, user } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  if (!body) return bad("Unknown action");
  if (action === "approval_decide") return decide(ctx, body);

  const needed = NEEDS[action];
  if (!needed) return bad("Unknown action");
  if (!can(ctx.role, needed)) return bad("Your staff role doesn't allow this.", 403);

  const reason = String(body.reason ?? "").trim().slice(0, 500);
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
    return data as { user_id: string; email: string | null; partner_code?: string | null } | null;
  }

  // ---------- actions that take two people ----------
  const twoPerson = TWO_PERSON[action];
  if (twoPerson) {
    const prepared = await twoPerson.prepare(ctx, body);
    if ("ok" in prepared) return reply(prepared);
    if (twoPerson.soloAllowed?.(prepared.payload)) return reply(await twoPerson.apply(ctx, prepared.payload, reason));

    const approvers = await otherHolders(service, needed, user.id);
    if (approvers.length === 0) {
      // A one-person company cannot ask a second person. Do it, and say so in the log.
      return reply(await twoPerson.apply(ctx, prepared.payload, `${reason} [no second staff member to approve]`));
    }
    const { data: existing } = await service
      .from("staff_approvals")
      .select("id")
      .eq("status", "pending")
      .eq("action", action)
      .eq("target_id", prepared.targetId)
      .limit(1);
    if (existing && existing.length > 0) return bad("This is already waiting for a second person's approval.", 409);
    const { error } = await service.from("staff_approvals").insert({
      action,
      payload: prepared.payload,
      target_type: prepared.targetType,
      target_id: prepared.targetId,
      target_label: prepared.targetLabel,
      summary: prepared.summary,
      reason,
      requested_by: user.id,
      requested_by_email: ctx.email,
    });
    if (error) {
      console.error("[staff] could not record an approval request:", error.message);
      return bad("Approvals aren't set up in the database yet. Run the release-queue-and-approvals migration first.", 409);
    }
    await logStaffAction(ctx, {
      action: `approval.requested.${action}`,
      targetType: prepared.targetType,
      targetId: prepared.targetId,
      targetLabel: prepared.targetLabel,
      reason,
    });
    for (const approver of approvers) {
      if (!approver.email) continue;
      await sendEmail({
        to: approver.email,
        subject: "KinWillow staff: an action needs your approval",
        html: brandedEmail({
          heading: "An action needs a second person",
          bodyHtml:
            `<p><strong>${escapeHtml(ctx.email ?? "A staff member")}</strong> wants to:</p>` +
            `<p style="font-size:17px;">${escapeHtml(prepared.summary)}.</p>` +
            `<p>Their reason: &ldquo;${escapeHtml(reason)}&rdquo;</p>` +
            "<p>It will not happen unless another staff member approves it. The request lapses after 7 days.</p>",
          ctaLabel: "Review it",
          ctaUrl: `${siteUrl()}/admin/approvals`,
        }),
      });
    }
    return NextResponse.json({ ok: true, pending: true });
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

  if (action === "send_reset" || action === "send_confirmation") {
    const userId = String(body.user_id ?? "");
    const profile = userId ? await profileOf(userId) : null;
    if (!profile?.email) return bad("User not found", 404);
    const isReset = action === "send_reset";
    const sent = isReset ? await sendPasswordResetEmail(profile.email) : await sendConfirmationLinkEmail(profile.email);
    await logStaffAction(ctx, {
      action: `${isReset ? "email.password_reset" : "email.confirmation"}${sent ? "" : ".failed"}`,
      targetType: "account",
      targetId: userId,
      targetLabel: profile.email,
      reason,
    });
    if (!sent) return bad("The email could not be sent. Please try again shortly.", 502);
    await auditForCustomer(ctx, userId, isReset ? "password_reset_sent" : "confirmation_sent");
    return NextResponse.json({ ok: true });
  }

  if (action === "release_hold" || action === "release_unhold") {
    const found = await loadRequest(service, String(body.request_id ?? ""));
    if (!found) return bad("Request not found", 404);
    const hold = action === "release_hold";
    const current = found.request as typeof found.request & { held_at?: string | null; release_at?: string };
    if (current.held_at === undefined) {
      return bad("Holds aren't set up in the database yet. Run the release-queue-and-approvals migration first.", 409);
    }
    if (found.request.state !== "waiting") return bad("This request is no longer waiting.", 409);
    if (hold === Boolean(current.held_at)) return bad(hold ? "This request is already on hold." : "This request is not on hold.", 409);
    const nowMs = Date.now();
    const patch = hold
      ? { held_at: new Date(nowMs).toISOString(), held_by: user.id, hold_reason: reason }
      : {
          held_at: null,
          held_by: null,
          hold_reason: null,
          // Never release the moment a hold is lifted.
          release_at: new Date(
            Math.max(new Date(current.release_at ?? nowMs).getTime(), nowMs + HOURS_AFTER_HOLD * 3600_000)
          ).toISOString(),
        };
    const { data: changed, error } = await service
      .from("disclosure_requests")
      .update(patch)
      .eq("id", found.request.id)
      .eq("state", "waiting")
      .select("id");
    if (error) return bad(error.message);
    if (!changed || changed.length === 0) return bad("This request is no longer waiting, so nothing was changed.", 409);
    await audit(found.request.household_id, hold ? "release_held" : "release_hold_lifted", "disclosure_request", found.request.id);
    await logStaffAction(ctx, {
      action: hold ? "release.held" : "release.hold_lifted",
      targetType: "emergency_request",
      targetId: found.request.id,
      targetLabel: found.label,
      reason,
    });
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action");
}

/** A second staff member approves or rejects a waiting request; the asker may withdraw it. */
async function decide(ctx: StaffContext, body: Record<string, unknown>) {
  const { service, user } = ctx;
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  const note = String(body.reason ?? "").trim().slice(0, 500);
  if (!["approve", "reject", "withdraw"].includes(decision)) return bad("Invalid decision");

  const { data } = await service.from("staff_approvals").select("*").eq("id", id).maybeSingle();
  const row = data as {
    id: string;
    action: string;
    payload: Record<string, unknown>;
    target_type: string | null;
    target_id: string | null;
    target_label: string | null;
    reason: string;
    requested_by: string;
    requested_by_email: string | null;
    status: string;
    expires_at: string;
  } | null;
  if (!row || row.status !== "pending") return bad("This request has already been decided.", 409);
  if (new Date(row.expires_at).getTime() < Date.now()) return bad("This request has lapsed. It needs to be asked for again.", 409);

  const permission = NEEDS_SECOND_PERSON[row.action];
  const handler = TWO_PERSON[row.action];
  if (!permission || !handler) return bad("Unknown action");
  const mine = row.requested_by === user.id;
  if (decision === "withdraw") {
    if (!mine) return bad("Only the person who asked can withdraw it.", 403);
  } else {
    if (mine) return bad("You asked for this, so a different staff member has to decide it.", 403);
    if (!can(ctx.role, permission)) return bad("Your staff role doesn't allow this.", 403);
    if (note.length < 3) return bad("Please add a short note. It is recorded in the staff log.");
  }

  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "withdrawn";
  // Claim it first, so two people deciding at once cannot both act.
  const { data: claimed, error } = await service
    .from("staff_approvals")
    .update({ status, decided_by: user.id, decided_by_email: ctx.email, decided_at: new Date().toISOString(), decision_note: note || null })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return bad(error.message);
  if (!claimed || claimed.length === 0) return bad("This request has already been decided.", 409);

  await logStaffAction(ctx, {
    action: `approval.${status}.${row.action}`,
    targetType: row.target_type ?? undefined,
    targetId: row.target_id,
    targetLabel: row.target_label,
    reason: note || null,
  });
  if (decision !== "approve") return NextResponse.json({ ok: true });

  const result = await handler.apply(
    ctx,
    row.payload,
    `${row.reason} [asked by ${row.requested_by_email ?? "staff"}, approved by ${ctx.email ?? "staff"}: ${note}]`
  );
  if (!result.ok) {
    await service.from("staff_approvals").update({ status: "failed", decision_note: `${note} — could not be carried out: ${result.error}` }).eq("id", id);
    return bad(`Approved, but it could not be carried out: ${result.error}`, result.status);
  }
  return NextResponse.json({ ok: true });
}
