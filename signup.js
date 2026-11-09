// KinWillow landing page — checklist signup capture.
// 1) Stores the email in Supabase (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// 2) If RESEND_API_KEY is set, emails the checklist link to the signup via Resend
//    (from the verified kinwillow.com domain) and, if NOTIFY_EMAIL is set,
//    sends a "new signup" notification there. Email failures never fail the signup.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const email = ((body && body.email) || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(500).json({ error: "Signup storage is not configured" });
    return;
  }
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/signups", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email: email, source: "landing-checklist" }),
    });
    if (!r.ok) {
      res.status(502).json({ error: "Could not save the signup" });
      return;
    }
  } catch (e) {
    res.status(502).json({ error: "Could not reach signup storage" });
    return;
  }

  // Best-effort email via Resend (checklist delivery + optional notification).
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const checklistUrl = "https://www.kinwillow.com/Family-Continuity-Checklist.pdf";
    const send = function (payload) {
      return fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch(function () {});
    };
    await send({
      from: "KinWillow <hello@kinwillow.com>",
      to: [email],
      subject: "Your Family Continuity Checklist — from KinWillow",
      html:
        "<p>Thank you for joining the KinWillow founding list.</p>" +
        "<p>Your free <strong>Family Continuity Checklist</strong> is here: " +
        '<a href="' + checklistUrl + '">Download the checklist (PDF)</a>.</p>' +
        "<p>Work through it section by section — you're not writing down passwords, " +
        "you're writing down where things are and how recovery works, so your family " +
        "could find everything if anything happened to you.</p>" +
        "<p>KinWillow turns this checklist into a living, secure vault with trusted " +
        "contacts and renewal reminders. We'll write again when founding access opens.</p>" +
        "<p>— KinWillow</p>",
    });
    if (process.env.NOTIFY_EMAIL) {
      await send({
        from: "KinWillow <hello@kinwillow.com>",
        to: [process.env.NOTIFY_EMAIL],
        subject: "New KinWillow checklist signup",
        html: "<p>New founding-list signup: <strong>" + email + "</strong></p>",
      });
    }
  }

  res.status(200).json({ ok: true });
};
