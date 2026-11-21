// Emergency release: owner notification and package release, shared by the
// public request route, the owner's "release now" action and the scheduled
// job. Server-side only (service-role client).
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { buildPackageContent, sealPackageContent } from "@/lib/disclosure";

/** How long a released package link stays valid. */
export const PACKAGE_VALID_DAYS = 30;
/** The owner always gets at least this long to veto after being told. */
export const MIN_VETO_HOURS = 48;
/** The final reminder goes out once this little of the wait is left. */
export const FINAL_REMINDER_HOURS = 36;

export type DisclosureRequestRow = {
  id: string;
  household_id: string;
  trusted_contact_id: string;
  request_class: string;
  reason: string | null;
  state: string;
  requested_at: string;
  release_at: string;
  owner_notified_at: string | null;
  owner_reminder_stage: number;
};

export type OwnerNoticeStage = "initial" | "midpoint" | "final";

function formatWhen(iso: string): string {
  // dateStyle/timeStyle cannot be combined with timeZoneName, so spell it out.
  // Emails carry an explicit zone because the reader's own zone is unknown.
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

/** The owner's sign-in email, read from the auth record (not the editable profile). */
export async function ownerEmail(service: SupabaseClient, householdId: string): Promise<string | null> {
  const { data: household, error } = await service
    .from("households")
    .select("owner_id")
    .eq("id", householdId)
    .single();
  if (error || !household?.owner_id) {
    console.error(`[release] household ${householdId} has no readable owner`, error?.message);
    return null;
  }
  const { data, error: userError } = await service.auth.admin.getUserById(household.owner_id);
  if (userError || !data?.user?.email) {
    console.error(`[release] could not read the owner's email for household ${householdId}`, userError?.message);
    return null;
  }
  return data.user.email;
}

/**
 * Tell the owner a request is pending so they can veto it. Returns true only
 * when the email provider accepted the message — automatic release depends on
 * at least one of these having succeeded.
 */
export async function notifyOwner(
  service: SupabaseClient,
  request: DisclosureRequestRow,
  stage: OwnerNoticeStage
): Promise<boolean> {
  const to = await ownerEmail(service, request.household_id);
  if (!to) return false;
  const { data: contact } = await service
    .from("trusted_contacts")
    .select("name")
    .eq("id", request.trusted_contact_id)
    .single();
  const contactName = escapeHtml(contact?.name ?? "A trusted contact");
  const what = request.request_class === "death" ? "death of the account owner" : "incapacity of the account owner";
  const when = formatWhen(request.release_at);

  const subject =
    stage === "initial"
      ? "Emergency access requested for your KinWillow vault"
      : stage === "midpoint"
        ? "Reminder: an emergency access request is waiting on your KinWillow vault"
        : "Final notice: your KinWillow recovery package is about to be released";
  const heading =
    stage === "initial"
      ? "Emergency access has been requested"
      : stage === "midpoint"
        ? "An emergency access request is still waiting"
        : "Your recovery package is about to be released";
  const lead =
    stage === "initial"
      ? `<p>Your trusted contact <strong>${contactName}</strong> has requested emergency access to your KinWillow vault (reason given: ${what}).</p>`
      : `<p>Your trusted contact <strong>${contactName}</strong> requested emergency access to your KinWillow vault on ${formatWhen(request.requested_at)} (reason given: ${what}). The request has not been stopped.</p>`;

  return sendEmail({
    to,
    subject,
    html: brandedEmail({
      heading,
      bodyHtml:
        lead +
        (request.reason ? `<p style="color:#55534a;">&ldquo;${escapeHtml(request.reason)}&rdquo;</p>` : "") +
        `<p><strong>Nothing has been shared yet.</strong> Unless you stop it, the recovery package you prepared for ${contactName} will be released automatically after <strong>${when}</strong>.</p>` +
        "<p>If this request is wrong, sign in and veto it before then — a veto stops it completely.</p>",
      ctaLabel: "Review the request",
      ctaUrl: `${siteUrl()}/app/emergency`,
      footnote: "If you expected this request, no action is needed.",
    }),
    text:
      `${contact?.name ?? "A trusted contact"} has requested emergency access to your KinWillow vault (reason given: ${what}).\n\n` +
      `Nothing has been shared yet. Unless you stop it, the recovery package will be released automatically after ${when}.\n\n` +
      `If this request is wrong, sign in and veto it: ${siteUrl()}/app/emergency\n`,
  });
}

/** Email the contact their package link. Records success so the job can retry failures. */
export async function notifyContactOfPackage(
  service: SupabaseClient,
  pkg: { id: string; trusted_contact_id: string; access_token: string; expires_at: string }
): Promise<boolean> {
  const { data: tc } = await service
    .from("trusted_contacts")
    .select("name, email")
    .eq("id", pkg.trusted_contact_id)
    .single();
  if (!tc?.email) {
    console.error(`[release] package ${pkg.id}: the trusted contact has no email on file`);
    return false;
  }
  const link = `${siteUrl()}/package/${pkg.access_token}`;
  const sent = await sendEmail({
    to: tc.email,
    subject: "Your KinWillow recovery package is ready",
    html: brandedEmail({
      heading: "Your recovery package is ready",
      bodyHtml:
        `<p>${tc.name ? `${escapeHtml(tc.name)}, the` : "The"} waiting period has ended and your KinWillow recovery package has been prepared. It contains the information the account owner chose to share with you — where things are, and how each provider's own recovery process works.</p>` +
        `<p>This link expires on <strong>${formatWhen(pkg.expires_at)}</strong>. Please open it somewhere private and do not forward it.</p>`,
      ctaLabel: "Open my recovery package",
      ctaUrl: link,
      footnote: "KinWillow never stores passwords. This package contains locations and instructions only.",
    }),
    text:
      "The waiting period has ended and your KinWillow recovery package is ready.\n\n" +
      `Open it here (expires ${formatWhen(pkg.expires_at)}): ${link}\n\n` +
      "Please open it somewhere private and do not forward it.\n",
  });
  if (sent) {
    await service
      .from("disclosure_packages")
      .update({ contact_notified_at: new Date().toISOString() })
      .eq("id", pkg.id);
  } else {
    console.error(`[release] package ${pkg.id}: could not email the trusted contact; the job will retry`);
  }
  return sent;
}

export type ReleaseResult =
  | { ok: true; package_id: string; access_token: string; expires_at: string; contact_notified: boolean }
  | { ok: false; status: number; error: string };

/**
 * Release one request: claim it (waiting → released) atomically, snapshot the
 * package, then email the contact. Safe to call concurrently — only one caller
 * wins the claim.
 *
 * `requireOwnerNotified` is true for automatic release: the veto is the only
 * safeguard, so nothing is released unless the owner was demonstrably told.
 */
export async function releaseRequest(
  service: SupabaseClient,
  requestId: string,
  opts: { actor: string | null; requireOwnerNotified: boolean }
): Promise<ReleaseResult> {
  const nowIso = new Date().toISOString();
  let claim = service
    .from("disclosure_requests")
    .update({ state: "released", released_at: nowIso })
    .eq("id", requestId)
    .eq("state", "waiting")
    .lte("release_at", nowIso);
  if (opts.requireOwnerNotified) claim = claim.not("owner_notified_at", "is", null);
  const { data: claimed, error: claimError } = await claim.select("id, household_id, trusted_contact_id");
  if (claimError) {
    console.error(`[release] request ${requestId}: claim failed`, claimError.message);
    return { ok: false, status: 500, error: "Could not release this request." };
  }
  const request = claimed?.[0];
  if (!request) {
    return {
      ok: false,
      status: 409,
      error: "This request is not ready to release (it was vetoed, already released, or its waiting period is not over).",
    };
  }

  const undoClaim = async () => {
    await service
      .from("disclosure_requests")
      .update({ state: "waiting", released_at: null })
      .eq("id", request.id)
      .eq("state", "released");
  };

  let pkg: { id: string; access_token: string; expires_at: string } | null = null;
  try {
    const content = await buildPackageContent(service, request.household_id, request.trusted_contact_id);
    const expires = new Date(Date.now() + PACKAGE_VALID_DAYS * 24 * 3600_000);
    const { data, error } = await service
      .from("disclosure_packages")
      .insert({
        request_id: request.id,
        household_id: request.household_id,
        trusted_contact_id: request.trusted_contact_id,
        content: sealPackageContent(request.household_id, content),
        expires_at: expires.toISOString(),
      })
      .select("id, access_token, expires_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "insert returned no row");
    pkg = data;
  } catch (err) {
    console.error(`[release] request ${request.id}: building the package failed; returned to waiting`, err);
    await undoClaim();
    return { ok: false, status: 500, error: "Could not build the recovery package. Nothing was released." };
  }

  await service.rpc("append_audit", {
    p_household: request.household_id,
    p_actor: opts.actor,
    p_action: opts.actor ? "disclosure.package_generated" : "disclosure.package_auto_released",
    p_entity: "disclosure_package",
    p_entity_id: pkg.id,
  });

  const contactNotified = await notifyContactOfPackage(service, {
    id: pkg.id,
    trusted_contact_id: request.trusted_contact_id,
    access_token: pkg.access_token,
    expires_at: pkg.expires_at,
  });

  return {
    ok: true,
    package_id: pkg.id,
    access_token: pkg.access_token,
    expires_at: pkg.expires_at,
    contact_notified: contactNotified,
  };
}
