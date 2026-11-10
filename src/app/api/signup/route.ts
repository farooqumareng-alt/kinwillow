import { NextResponse } from "next/server";

// Checklist signup capture — ported from the Stage 1 serverless function.
// Stores the email in Supabase (signups), then best-effort emails the
// checklist link via Resend. Email failures never fail the signup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
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

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const checklistUrl = "https://www.kinwillow.com/Family-Continuity-Checklist.pdf";
    const send = (payload: unknown) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    await send({
      from: "KinWillow <info@kinwillow.com>",
      to: [email],
      subject: "Your Family Continuity Checklist — from KinWillow",
      html:
        "<p>Thank you for joining the KinWillow founding list.</p>" +
        "<p>Your free <strong>Family Continuity Checklist</strong> is here: " +
        `<a href="${checklistUrl}">Download the checklist (PDF)</a>.</p>` +
        "<p>Work through it section by section — you're not writing down passwords, " +
        "you're writing down where things are and how recovery works, so your family " +
        "could find everything if anything happened to you.</p>" +
        "<p>KinWillow turns this checklist into a living, secure vault with trusted " +
        "contacts and renewal reminders. We'll write again when founding access opens.</p>" +
        "<p>— KinWillow</p>",
    });
    if (process.env.NOTIFY_EMAIL) {
      await send({
        from: "KinWillow <info@kinwillow.com>",
        to: [process.env.NOTIFY_EMAIL],
        subject: "New KinWillow checklist signup",
        html: `<p>New founding-list signup: <strong>${email}</strong></p>`,
      });
    }
  }
  return NextResponse.json({ ok: true });
}
