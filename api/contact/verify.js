// KinWillow contact form — step 2: verify the 6-digit email code.
// On success the pending message moves to the messages table, is emailed
// to info@kinwillow.com via Resend (when configured), and the pending row
// is deleted. Codes expire after 15 minutes and allow at most 5 attempts.

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
    const cleanEmail = String((req.body || {}).email || "").trim().toLowerCase();
    const code = String((req.body || {}).code || "").trim();
    if (!/^\d{6}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "Enter the 6-digit code from your email." });
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
    const pendingUrl = `${supabaseUrl}/rest/v1/contact_pending?email=eq.${encodeURIComponent(cleanEmail)}`;

    const lookup = await fetch(`${pendingUrl}&order=created_at.desc&limit=1`, { headers: sb });
    if (!lookup.ok) return res.status(502).json({ ok: false, error: "Verification lookup failed." });
    const rows = await lookup.json();
    const pending = rows && rows[0];
    if (!pending) {
      return res.status(400).json({ ok: false, error: "No code is waiting for that email — please submit the form again." });
    }
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await fetch(pendingUrl, { method: "DELETE", headers: sb }).catch(() => {});
      return res.status(400).json({ ok: false, error: "That code has expired — please submit the form again for a fresh one." });
    }
    if (pending.attempts >= 5) {
      return res.status(429).json({ ok: false, error: "Too many attempts — please submit the form again for a fresh code." });
    }
    if (pending.code_hash !== hashCode(code, cleanEmail)) {
      await fetch(`${supabaseUrl}/rest/v1/contact_pending?id=eq.${pending.id}`, {
        method: "PATCH",
        headers: { ...sb, Prefer: "return=minimal" },
        body: JSON.stringify({ attempts: pending.attempts + 1 }),
      }).catch(() => {});
      return res.status(400).json({ ok: false, error: "That code doesn't match — check your email and try again." });
    }

    // Verified: move the message into the messages table.
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
      console.error("messages insert failed:", insert.status, await insert.text().catch(() => ""));
      return res.status(502).json({ ok: false, error: "Could not save your message." });
    }

    // Email it to the KinWillow mailbox (message is already safely stored).
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "KinWillow site <info@kinwillow.com>",
          to: ["info@kinwillow.com"],
          reply_to: pending.email,
          subject: `Website message (${pending.topic}) from ${pending.name} — verified`,
          text:
            `New verified message from the KinWillow contact form.\n\n` +
            `Name: ${pending.name}\nEmail: ${pending.email} (verified)\nTopic: ${pending.topic}\n\n${pending.message}\n`,
        }),
      });
      if (!sent.ok) console.error("Resend contact email failed:", sent.status);
    }

    await fetch(pendingUrl, { method: "DELETE", headers: sb }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Verify handler error:", err);
    return res.status(500).json({ ok: false, error: "Something went wrong." });
  }
}
