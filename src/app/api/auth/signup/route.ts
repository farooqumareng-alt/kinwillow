import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendEmail, siteUrl } from "@/lib/email";
import { clientIp, withinLimits, tooManyRequests, HOUR } from "@/lib/rate-limit";

// Create an account and email the confirmation link ourselves, through the
// same sender as every other KinWillow email. (Supabase's built-in mailer is
// not used: it is heavily limited and fails independently of ours.)
// The answer is the same whether or not the address already has an account.
const MIN_LENGTH = 10;
const FROM = "KinWillow <no-reply@kinwillow.com>";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim().slice(0, 120);
    const partner = String(body.partner || "").trim().slice(0, 32);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "That email address doesn't look right. Check it and try again." }, { status: 400 });
    }
    if (password.length < MIN_LENGTH) {
      return NextResponse.json({ ok: false, error: `Use at least ${MIN_LENGTH} characters for your password.` }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
    }
    const allowed = await withinLimits([
      { action: "signup:ip", subject: clientIp(req), limit: 10, windowSeconds: HOUR },
      { action: "signup:email", subject: email, limit: 4, windowSeconds: HOUR },
    ]);
    if (!allowed) return tooManyRequests("Too many attempts. Please wait a while and try again.");

    const service = createServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: { display_name: name, ...(partner ? { partner_code: partner } : {}) } },
    });

    let sent: boolean;
    if (error || !data?.properties?.hashed_token) {
      const exists = /already (been )?registered|email_exists|already exists/i.test(
        `${error?.message ?? ""} ${(error as { code?: string } | null)?.code ?? ""}`
      );
      if (!exists) {
        console.error("[auth] signup could not be created:", error?.message);
        return NextResponse.json({ ok: false, error: "We couldn't create your account just now. Please try again shortly." }, { status: 502 });
      }
      // Someone already has an account here. Tell the mailbox owner, not the
      // person at the keyboard.
      sent = await sendEmail({
        to: email,
        from: FROM,
        subject: "You already have a KinWillow account",
        html: brandedEmail({
          heading: "You already have a KinWillow account",
          bodyHtml:
            "<p>Someone just tried to create a KinWillow account with this email address, but one already exists.</p>" +
            "<p>If that was you, sign in instead. If you've forgotten your password, you can reset it from the sign-in page.</p>",
          ctaLabel: "Sign in",
          ctaUrl: `${siteUrl()}/login`,
          footnote: "If this wasn't you, no action is needed — nothing has changed on your account.",
        }),
        text:
          "Someone just tried to create a KinWillow account with this email address, but one already exists.\n\n" +
          `If that was you, sign in at ${siteUrl()}/login — you can reset your password there if you've forgotten it.\n\n` +
          "If this wasn't you, no action is needed.\n",
      });
    } else {
      const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=signup`;
      sent = await sendEmail({
        to: email,
        from: FROM,
        subject: "Confirm your email to open your KinWillow vault",
        html: brandedEmail({
          heading: "Welcome to KinWillow",
          bodyHtml:
            "<p>Thank you for creating your family continuity vault. Confirm this email address to open it.</p>",
          ctaLabel: "Confirm my email",
          ctaUrl: link,
          footnote:
            "The button works once. If it has expired, sign up again with the same address and we'll send a fresh one. If you didn't create a KinWillow account, you can ignore this email.",
        }),
        text:
          "Thank you for creating your KinWillow vault. Confirm this email address to open it:\n\n" +
          `${link}\n\n` +
          "The link works once. If you didn't create a KinWillow account, you can ignore this email.\n",
      });
    }
    if (!sent) {
      return NextResponse.json(
        { ok: false, error: "We couldn't send an email to that address. Check it for typos and try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth] signup failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
