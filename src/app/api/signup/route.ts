import { NextResponse } from "next/server";
import { brandedEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { clientIp, withinLimits, tooManyRequests, HOUR, DAY } from "@/lib/rate-limit";

// Checklist signup capture — ported from the Stage 1 serverless function.
// Stores the email in Supabase (signups), then best-effort emails the
// checklist link via Resend. Email failures never fail the signup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!(await withinLimits([{ action: "signup:ip", subject: clientIp(req), limit: 5, windowSeconds: HOUR }]))) {
    return tooManyRequests();
  }
  // One checklist email per address per day: a repeat submission is answered
  // as a success (the checklist is on its way) without sending it again.
  if (!(await withinLimits([{ action: "signup:email", subject: email, limit: 1, windowSeconds: DAY }]))) {
    return NextResponse.json({ ok: true });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Signup storage is not configured" }, { status: 500 });
  }
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/signups", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email, source: "landing-checklist" }),
    });
    if (!r.ok) return NextResponse.json({ error: "Could not save the signup" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Could not reach signup storage" }, { status: 502 });
  }

  const checklistUrl = `${siteUrl()}/Family-Continuity-Checklist.pdf`;
  await sendEmail({
    to: email,
    subject: "Your Family Continuity Checklist — from KinWillow",
    html: brandedEmail({
      heading: "Your Family Continuity Checklist",
      bodyHtml:
        "<p>Thank you for asking for the KinWillow checklist.</p>" +
        "<p>Your free <strong>Family Continuity Checklist</strong> is ready. Work through it section by section — you're not writing down passwords; you're writing down where things are and how recovery works, so your family could find everything if anything happened to you.</p>" +
        "<p>KinWillow turns this checklist into a living, secure vault with trusted contacts and renewal reminders. You can start a free vault whenever you're ready. This is the only email we'll send you about it.</p><p>— The KinWillow team</p>",
      ctaLabel: "Download the checklist (PDF)",
      ctaUrl: checklistUrl,
    }),
  });
  if (process.env.NOTIFY_EMAIL) {
    await sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: "New KinWillow checklist request",
      html: brandedEmail({ heading: "New checklist request", bodyHtml: `<p>Checklist sent to: <strong>${escapeHtml(email)}</strong></p>` }),
    });
  }
  return NextResponse.json({ ok: true });
}
