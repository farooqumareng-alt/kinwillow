// Shared branded email: every KinWillow email goes out through Resend in the
// same professional shell (logo header, brand colours, plain footer).
// Sends never throw — callers treat email as best-effort unless they check.

const SHELL = (inner: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3efe6;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4ddcb;border-radius:10px;overflow:hidden;">
<tr><td style="background:#faf7f0;padding:22px 32px;border-bottom:3px solid #c9a86a;">
<img src="https://www.kinwillow.com/logo-symbol.png" alt="KinWillow" width="44" height="44" style="vertical-align:middle;">
<span style="font-size:22px;letter-spacing:3px;color:#1f4030;vertical-align:middle;margin-left:10px;">KIN<span style="color:#c9a86a;">WILLOW</span></span>
</td></tr>
<tr><td style="padding:30px 32px;color:#2b2b26;font-size:16px;line-height:1.65;">${inner}</td></tr>
<tr><td style="padding:18px 32px;background:#faf7f0;border-top:1px solid #e4ddcb;color:#7a7565;font-size:12.5px;line-height:1.6;">
KinWillow — the family continuity vault. Your family can find everything, if anything happens to you.<br>
<a href="https://www.kinwillow.com" style="color:#2e5a3d;">kinwillow.com</a> · This email was sent by KinWillow. If it wasn't meant for you, you can ignore it.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

export function brandedEmail(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:26px 0;"><a href="${opts.ctaUrl}" style="background:#2e5a3d;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:6px;font-size:16px;display:inline-block;">${opts.ctaLabel}</a></p>`
      : "";
  const foot = opts.footnote ? `<p style="color:#7a7565;font-size:13.5px;">${opts.footnote}</p>` : "";
  return SHELL(
    `<h1 style="font-size:21px;color:#1f4030;margin:0 0 14px;font-weight:normal;">${opts.heading}</h1>${opts.bodyHtml}${cta}${foot}`
  );
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "KinWillow <info@kinwillow.com>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
