import { NextResponse } from "next/server";
import crypto from "node:crypto";

// Contact form step 1 — ported from the Stage 1 serverless function.
// Stores a PENDING message and emails a 6-digit verification code.
function hashCode(code: string, email: string) {
  return crypto.createHash("sha256").update(`${code}:${email}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { name, email, topic, message, website } = await req.json().catch(() => ({}));
    if (website) return NextResponse.json({ ok: true, step: "code" }); // honeypot

    const cleanName = String(name || "").trim().slice(0, 120);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanTopic = String(topic || "general").trim().slice(0, 40);
    const cleanMessage = String(message || "").trim().slice(0, 5000);
    if (!cleanName || !cleanMessage || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ ok: false, error: "Please complete the form." }, { status: 400 });
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
    await fetch(`${supabaseUrl}/rest/v1/contact_pending?email=eq.${encodeURIComponent(cleanEmail)}`, {
      method: "DELETE",
      headers: sb,
    }).catch(() => {});

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const insert = await fetch(`${supabaseUrl}/rest/v1/contact_pending`, {
      method: "POST",
      headers: { ...sb, Prefer: "return=minimal" },
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        topic: cleanTopic,
        message: cleanMessage,
        code_hash: hashCode(code, cleanEmail),
        expires_at: expiresAt,
      }),
    });
    if (!insert.ok) {
      return NextResponse.json({ ok: false, error: "Could not start verification." }, { status: 502 });
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json(
        { ok: false, error: "Email verification isn't switched on yet — your message is saved; please try again shortly." },
        { status: 503 }
      );
    }
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "KinWillow <info@kinwillow.com>",
        to: [cleanEmail],
        subject: "Your KinWillow verification code",
        text:
          `Your verification code is ${code}\n\n` +
          "Enter it on the KinWillow contact page to send your message. " +
          "The code expires in 15 minutes.\n\n" +
          "If you didn't request this, you can ignore this email.\n",
      }),
    });
    if (!sent.ok) {
      return NextResponse.json(
        { ok: false, error: "We couldn't send the verification email — your message is saved; please try again shortly." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, step: "code" });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
