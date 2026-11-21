import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  FINAL_REMINDER_HOURS,
  MIN_VETO_HOURS,
  notifyContactOfPackage,
  notifyOwner,
  releaseRequest,
  type DisclosureRequestRow,
} from "@/lib/release";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scheduled job (see vercel.json). For every waiting emergency request it:
//   1. retries the owner notification if it never went out (and holds release
//      until it has, giving the owner a fresh minimum veto window);
//   2. sends the owner a midpoint and a final reminder;
//   3. releases the package once the waiting period is over;
// and it retries any "your package is ready" email that failed to send.
//
// Vercel calls this with "Authorization: Bearer $CRON_SECRET".
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set; the disclosure job cannot run");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 501 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let service;
  try {
    service = createServiceClient();
  } catch {
    console.error("[cron] service role is not configured; the disclosure job cannot run");
    return NextResponse.json({ error: "Service role is not configured" }, { status: 501 });
  }

  const summary = {
    waiting: 0,
    owner_notified: 0,
    owner_notify_failed: 0,
    reminders_sent: 0,
    released: 0,
    release_failed: 0,
    contact_emails_retried: 0,
  };

  const { data: rows, error } = await service
    .from("disclosure_requests")
    .select("*")
    .eq("state", "waiting")
    .order("release_at", { ascending: true });
  if (error) {
    console.error("[cron] could not read waiting requests", error.message);
    return NextResponse.json({ error: "Could not read waiting requests" }, { status: 500 });
  }

  for (const request of (rows ?? []) as DisclosureRequestRow[]) {
    summary.waiting++;
    const now = Date.now();
    const releaseAt = new Date(request.release_at).getTime();
    const requestedAt = new Date(request.requested_at).getTime();

    try {
      // 1. The owner was never told: tell them now, and guarantee a veto window.
      if (!request.owner_notified_at) {
        const minRelease = now + MIN_VETO_HOURS * 3600_000;
        const pending = { ...request, release_at: new Date(Math.max(releaseAt, minRelease)).toISOString() };
        if (await notifyOwner(service, pending, "initial")) {
          await service
            .from("disclosure_requests")
            .update({ owner_notified_at: new Date().toISOString(), release_at: pending.release_at })
            .eq("id", request.id)
            .eq("state", "waiting");
          summary.owner_notified++;
        } else {
          summary.owner_notify_failed++;
          console.error(`[cron] request ${request.id}: owner still not notified; release is on hold`);
        }
        continue;
      }

      // 2. The wait is over: release.
      if (releaseAt <= now) {
        const result = await releaseRequest(service, request.id, { actor: null, requireOwnerNotified: true });
        if (result.ok) summary.released++;
        else if (result.status !== 409) summary.release_failed++;
        continue;
      }

      // 3. Reminders. At most one per run; the final reminder supersedes the midpoint.
      const stage = request.owner_reminder_stage ?? 0;
      const finalDue = releaseAt - now <= FINAL_REMINDER_HOURS * 3600_000;
      const midpointDue = now - requestedAt >= (releaseAt - requestedAt) / 2;
      const next = finalDue && stage < 2 ? 2 : midpointDue && stage < 1 ? 1 : 0;
      if (next > 0 && (await notifyOwner(service, request, next === 2 ? "final" : "midpoint"))) {
        await service.from("disclosure_requests").update({ owner_reminder_stage: next }).eq("id", request.id);
        summary.reminders_sent++;
      }
    } catch (err) {
      summary.release_failed++;
      console.error(`[cron] request ${request.id}: unexpected failure`, err);
    }
  }

  // Retry "your package is ready" emails that did not go out.
  const { data: unsent } = await service
    .from("disclosure_packages")
    .select("id, trusted_contact_id, access_token, expires_at")
    .is("contact_notified_at", null)
    .gt("expires_at", new Date().toISOString())
    .gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString());
  for (const pkg of unsent ?? []) {
    if (await notifyContactOfPackage(service, pkg)) summary.contact_emails_retried++;
  }

  console.log("[cron] disclosure job finished", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
