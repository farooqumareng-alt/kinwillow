// KinWillow contact form — step 1 (Vercel serverless function).
// Validates the submission, stores it as a PENDING message in Supabase
// (table: contact_pending), and emails the visitor a 6-digit verification
// code via Resend. Nothing reaches the messages table or the KinWillow
// inbox until the visitor proves they own the email address
// (see api/contact/verify.js). A hidden honeypot field ("website")
// silently drops bot submissions.

import crypto from "node:crypto";

function hashCode(code, email) {
  return crypto.createHash("sha256").update(`${code}:${email}`).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { name, email, topic, message, website } = req.body || {};

    // Honeypot: real people never see or fill this field. Pretend success.
    if (website) return res.status(200).json({ ok: true, step: "code" });

    const cleanName = String(name || "").trim().slice(0, 120);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanTopic = String(topic || "general").trim().slice(0, 40);
    const cleanMessage = String(message || "").trim().slice(0, 5000);

    if (!cleanName || !cleanMessage || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "Please complete the form." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Messaging is not configured." });
    }
    const sb = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Replace any earlier pending attempt for this address.
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
      console.error("contact_pending insert failed:", insert.status, await insert.text().catch(() => ""));
      return res.status(502).json({ ok: false, error: "Could not start verification." });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      // The message is safely stored as pending, but no code can be sent.
      console.error("RESEND_API_KEY missing — verification code not sent for", cleanEmail);
      return res.status(503).json({
        ok: false,
        error: "Email verification isn't switched on yet — your message is saved; please try again shortly.",
      });
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
          `Enter it on the KinWillow contact page to send your message. ` +
          `The code expires in 15 minutes.\n\n` +
          `If you didn't request this, you can ignore this email.\n`,
      }),
    });
    if (!sent.ok) {
      console.error("Resend verification email failed:", sent.status, await sent.text().catch(() => ""));
      return res.status(502).json({
        ok: false,
        error: "We couldn't send the verification email — your message is saved; please try again shortly.",
      });
    }

    return res.status(200).json({ ok: true, step: "code" });
  } catch (err) {
    console.error("Contact handler error:", err);
    return res.status(500).json({ ok: false, error: "Something went wrong." });
  }
}
