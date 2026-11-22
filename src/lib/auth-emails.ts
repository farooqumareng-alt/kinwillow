import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendEmail, siteUrl } from "@/lib/email";

// One-time account links, generated server-side and sent through our own
// sender. Each returns true only when an email actually went out.
const FROM = "KinWillow <no-reply@kinwillow.com>";

/** Password reset. False when the address has no account or sending failed. */
export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return false;
  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const sent = await sendEmail({
    to: email,
    from: FROM,
    subject: "Reset your KinWillow password",
    html: brandedEmail({
      heading: "Reset your KinWillow password",
      bodyHtml: "<p>We received a request to reset the password for your KinWillow vault.</p>",
      ctaLabel: "Choose a new password",
      ctaUrl: link,
      footnote:
        "The button works once and expires soon. If you didn't ask for this, you can ignore this email — your password has not changed.",
    }),
    text:
      "We received a request to reset the password for your KinWillow vault. Choose a new one here:\n\n" +
      `${link}\n\n` +
      "The link works once and expires soon. If you didn't ask for this, you can ignore this email.\n",
  });
  if (!sent) console.error("[auth] password reset email was not sent");
  return sent;
}

/** A fresh link that confirms the address and opens the vault, for someone whose first one expired. */
export async function sendConfirmationLinkEmail(email: string): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return false;
  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
  const sent = await sendEmail({
    to: email,
    from: FROM,
    subject: "Your new KinWillow confirmation link",
    html: brandedEmail({
      heading: "Confirm your email",
      bodyHtml: "<p>Here is a fresh link to confirm your email address and open your KinWillow vault.</p>",
      ctaLabel: "Confirm my email",
      ctaUrl: link,
      footnote: "The button works once and expires soon. If you weren't expecting this, you can ignore this email.",
    }),
    text:
      "Here is a fresh link to confirm your email address and open your KinWillow vault:\n\n" +
      `${link}\n\n` +
      "The link works once and expires soon.\n",
  });
  if (!sent) console.error("[auth] confirmation link email was not sent");
  return sent;
}
