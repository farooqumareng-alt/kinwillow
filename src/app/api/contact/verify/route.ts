import { NextResponse } from "next/server";
import crypto from "node:crypto";

// Contact form step 2 — ported from the Stage 1 serverless function.
// Verifies the 6-digit code; on success the message moves to `messages`,
// is emailed to info@kinwillow.com, and the pending row is deleted.
function hashCode(code: string, email: string) {
  return crypto.createHash("sha256").update(`${code}:${email}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cleanEmail = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();
    if (!/^\d{6}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit code from your email." }, { status: 400 });
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: "Messaging is not configured." }, { status: 500 });
    }
    const sb = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const pendingUrl = `${supabaseUrl}/rest/v1/contact_pending?email=eq.${encodeURIComponent(cleanEmail)}`;
    const lookup = await fetch(`${pendingUrl}&order=created_at.desc&limit=1`, { headers: sb });
    if (!lookup.ok) return NextResponse.json({ ok: false, error: "Verification lookup failed." }, { status: 502 });
    const rows = await lookup.json();
    const pending = rows && rows[0];
    if (!pending) {
      return NextResponse.json({ ok: false, error: "No code is waiting for that email — please submit the form again." }, { status: 400 });
    }
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await fetch(pendingUrl, { method: "DELETE", headers: sb }).catch(() => {});
      return NextResponse.json({ ok: false, error: "That code has expired — please submit the form again for a fresh one." }, { status: 400 });
    }
    if (pending.attempts >= 5) {
      return NextResponse.json({ ok: false, error: "Too many attempts — please submit the form again for a fresh code." }, { status: 429 });
    }
    if (pending.code_hash !== hashCode(code, cleanEmail)) {
      await fetch(`${supabaseUrl}/rest/v1/contact_pending?id=eq.${pending.id}`, {
        method: "PATCH",
        headers: { ...sb, Prefer: "return=minimal" },
        body: JSON.stringify({ attempts: pending.attempts + 1 }),
      }).catch(() => {});
      return NextResponse.json({ ok: false, error: "That code doesn't match — check your email and try again." }, { status: 400 });
    }
    const insert = await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: { ...sb, Prefer: "return=minimal" },
      body: JSON.stringify({
        name: pending.name,
        email: pending.email,
        topic: pending.topic,
        message: pending.message,
      }),
    });
    if (!insert.ok) {
      return NextResponse.json({ ok: false, error: "Could not save your message." }, { status: 502 });
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "KinWillow site <info@kinwillow.com>",
          to: ["info@kinwillow.com"],
          reply_to: pending.email,
          subject: `Website message (${pending.topic}) from ${pending.name} — verified`,
          text:
            "New verified message from the KinWillow contact form.\n\n" +
            `Name: ${pending.name}\nEmail: ${pending.email} (verified)\nTopic: ${pending.topic}\n\n${pending.message}\n`,
        }),
      }).catch(() => {});
    }
    await fetch(pendingUrl, { method: "DELETE", headers: sb }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
