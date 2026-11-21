import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronAuthorized } from "@/lib/cron";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { ownerEmail } from "@/lib/release";
import { deleteAccount, DELETION_GRACE_DAYS } from "@/lib/account";
import { REVIEW_REMINDER_EVERY_DAYS, reviewCutoff } from "@/lib/review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily job (see vercel.json):
//   1. renewal reminders — one digest per household for items whose renewal
//      or expiry date is coming up (early notice, then a 7-day notice);
//   2. re-check reminders — legacy settings whose re-check date is near;
//   3. account deletions whose 30-day grace period has ended;
//   4. an annual-review nudge when items have gone a year unconfirmed.
const DEFAULT_NOTICE_DAYS = 30;
const FINAL_NOTICE_DAYS = 7;
const RECHECK_NOTICE_DAYS = 14;
const DAY = 24 * 3600_000;

type Item = {
  id: string;
  household_id: string;
  title: string;
  provider_name: string | null;
  renewal_date: string;
  notice_days: number | null;
  renewal_reminder_stage: number;
};
type Recheck = {
  id: string;
  household_id: string;
  provider_id: string;
  account_ref: string | null;
  recheck_due: string;
  recheck_reminded_for: string | null;
};

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
const pretty = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

function whenPhrase(days: number): string {
  if (days < 0) return `passed ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set; the reminders job cannot run");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 501 });
  }
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let service;
  try {
    service = createServiceClient();
  } catch {
    console.error("[cron] service role is not configured; the reminders job cannot run");
    return NextResponse.json({ error: "Service role is not configured" }, { status: 501 });
  }

  const summary = {
    reminder_emails: 0,
    reminder_email_failures: 0,
    review_emails: 0,
    accounts_deleted: 0,
    deletion_failures: 0,
  };
  const now = new Date();
  const today = dateOnly(now);

  // ----- 1 & 2: gather what is due, per household -----
  const { data: itemRows, error: itemsError } = await service
    .from("inventory_items")
    .select("id, household_id, title, provider_name, renewal_date, notice_days, renewal_reminder_stage")
    .eq("archived", false)
    .not("renewal_date", "is", null)
    .lt("renewal_reminder_stage", 2)
    .gte("renewal_date", dateOnly(new Date(now.getTime() - 30 * DAY)))
    .lte("renewal_date", dateOnly(new Date(now.getTime() + 366 * DAY)));
  if (itemsError) console.error("[cron] could not read renewal dates", itemsError.message);

  const { data: recheckRows, error: recheckError } = await service
    .from("continuity_records")
    .select("id, household_id, provider_id, account_ref, recheck_due, recheck_reminded_for, verified_state")
    .in("verified_state", ["attested", "evidence_verified"])
    .not("recheck_due", "is", null)
    .lte("recheck_due", dateOnly(new Date(now.getTime() + RECHECK_NOTICE_DAYS * DAY)));
  if (recheckError) console.error("[cron] could not read re-check dates", recheckError.message);

  const due = new Map<string, { items: Array<Item & { stage: number; days: number }>; rechecks: Recheck[] }>();
  const bucket = (hid: string) => {
    if (!due.has(hid)) due.set(hid, { items: [], rechecks: [] });
    return due.get(hid)!;
  };
  for (const item of (itemRows ?? []) as Item[]) {
    const days = daysUntil(item.renewal_date, today);
    const notice = Math.max(item.notice_days ?? DEFAULT_NOTICE_DAYS, FINAL_NOTICE_DAYS);
    const stage = days <= FINAL_NOTICE_DAYS ? 2 : days <= notice ? 1 : 0;
    if (stage > item.renewal_reminder_stage) bucket(item.household_id).items.push({ ...item, stage, days });
  }
  for (const rec of (recheckRows ?? []) as Recheck[]) {
    if (rec.recheck_reminded_for !== rec.recheck_due) bucket(rec.household_id).rechecks.push(rec);
  }

  const { data: providers } = await service.from("provider_catalog").select("id, name");
  const providerName = new Map((providers ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

  for (const [householdId, { items, rechecks }] of due) {
    try {
      const { data: household } = await service.from("households").select("status").eq("id", householdId).single();
      if (!household) continue;
      const to = await ownerEmail(service, householdId);
      if (!to) {
        summary.reminder_email_failures++;
        continue;
      }
      items.sort((a, b) => a.days - b.days);
      const itemLines = items.map(
        (i) =>
          `<li><strong>${escapeHtml(i.title)}</strong>${i.provider_name ? ` (${escapeHtml(i.provider_name)})` : ""} — ${pretty(i.renewal_date)}, ${whenPhrase(i.days)}</li>`
      );
      const recheckLines = rechecks.map(
        (r) =>
          `<li><strong>${escapeHtml(providerName.get(r.provider_id) ?? r.provider_id)}</strong>${r.account_ref ? ` (${escapeHtml(r.account_ref)})` : ""} — re-check by ${pretty(r.recheck_due)}</li>`
      );
      const soonest = items[0];
      const subject = soonest
        ? items.length === 1
          ? `Reminder: ${soonest.title} — ${whenPhrase(soonest.days)}`
          : `Reminder: ${items.length} dates coming up in your KinWillow vault`
        : "Reminder: time to re-check a legacy setting in your KinWillow vault";
      const sent = await sendEmail({
        to,
        subject,
        html: brandedEmail({
          heading: "Your KinWillow reminders",
          bodyHtml:
            (itemLines.length
              ? `<p>These renewal or expiry dates in your vault are coming up:</p><ul style="padding-left:20px;">${itemLines.join("")}</ul>`
              : "") +
            (recheckLines.length
              ? `<p>These legacy settings are due a quick re-check, so your family's plan stays current:</p><ul style="padding-left:20px;">${recheckLines.join("")}</ul>`
              : "") +
            (household.status === "sealed"
              ? "<p>Your vault is currently sealed (read-only). Renew your plan to update these dates.</p>"
              : ""),
          ctaLabel: itemLines.length ? "Open my vault" : "Open the Continuity Centre",
          ctaUrl: `${siteUrl()}${itemLines.length ? "/app/inventory" : "/app/continuity"}`,
          footnote:
            "You get these because you set a renewal or re-check date in your vault. Remove the date from an item to stop its reminders.",
        }),
      });
      if (!sent) {
        summary.reminder_email_failures++;
        continue; // stages are left untouched, so tomorrow's run retries
      }
      summary.reminder_emails++;
      for (const stage of [1, 2]) {
        const ids = items.filter((i) => i.stage === stage).map((i) => i.id);
        if (ids.length) await service.from("inventory_items").update({ renewal_reminder_stage: stage }).in("id", ids);
      }
      for (const r of rechecks) {
        await service.from("continuity_records").update({ recheck_reminded_for: r.recheck_due }).eq("id", r.id);
      }
    } catch (err) {
      summary.reminder_email_failures++;
      console.error(`[cron] reminders for household ${householdId} failed`, err);
    }
  }

  // ----- annual review: items nobody has confirmed for a year -----
  const { data: staleRows, error: staleError } = await service
    .from("inventory_items")
    .select("household_id")
    .eq("archived", false)
    .lt("reviewed_at", reviewCutoff(now).toISOString());
  if (staleError) {
    console.error("[cron] could not read review dates (has migration 000015 been run?)", staleError.message);
  }
  const staleByHousehold = new Map<string, number>();
  for (const r of (staleRows ?? []) as Array<{ household_id: string }>) {
    staleByHousehold.set(r.household_id, (staleByHousehold.get(r.household_id) ?? 0) + 1);
  }
  const remindAgainBefore = new Date(now.getTime() - REVIEW_REMINDER_EVERY_DAYS * DAY).toISOString();
  for (const [householdId, count] of staleByHousehold) {
    try {
      const { data: household } = await service
        .from("households")
        .select("status, review_reminded_at")
        .eq("id", householdId)
        .single();
      if (!household || household.status !== "active") continue;
      if (household.review_reminded_at && household.review_reminded_at > remindAgainBefore) continue;
      const to = await ownerEmail(service, householdId);
      if (!to) continue;
      const sent = await sendEmail({
        to,
        subject: "Time for a quick look over your KinWillow vault",
        html: brandedEmail({
          heading: "Is your vault still true?",
          bodyHtml:
            `<p>${count} item${count === 1 ? " in your vault hasn't" : "s in your vault haven't"} been confirmed or changed in over a year.</p>` +
            "<p>Accounts close, policies move and boxes get reorganised. A few minutes confirming what is still correct means your family can rely on what they find.</p>",
          ctaLabel: "Start the annual review",
          ctaUrl: `${siteUrl()}/app/review`,
          footnote: "We send this at most once every three months, and only while something is due.",
        }),
      });
      if (!sent) {
        summary.reminder_email_failures++;
        continue;
      }
      summary.review_emails++;
      await service.from("households").update({ review_reminded_at: now.toISOString() }).eq("id", householdId);
    } catch (err) {
      summary.reminder_email_failures++;
      console.error(`[cron] review reminder for household ${householdId} failed`, err);
    }
  }

  // ----- 3: account deletions past their grace period -----
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * DAY).toISOString();
  const { data: toDelete, error: deleteQueryError } = await service
    .from("profiles")
    .select("user_id")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff);
  if (deleteQueryError) console.error("[cron] could not read pending deletions", deleteQueryError.message);
  for (const profile of (toDelete ?? []) as Array<{ user_id: string }>) {
    try {
      await deleteAccount(service, profile.user_id);
      summary.accounts_deleted++;
    } catch (err) {
      summary.deletion_failures++;
      console.error(`[cron] deleting account ${profile.user_id} failed; will retry tomorrow`, err);
    }
  }

  // ----- 4: housekeeping — rows nobody needs after a day or two -----
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY).toISOString();
  for (const [table, column] of [
    ["rate_limits", "window_start"],
    ["login_codes", "created_at"],
    ["contact_pending", "created_at"],
  ] as const) {
    const { error } = await service.from(table).delete().lt(column, twoDaysAgo);
    if (error) console.error(`[cron] could not prune ${table}`, error.message);
  }

  console.log("[cron] reminders job finished", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
