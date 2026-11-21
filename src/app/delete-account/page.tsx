import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your KinWillow account",
  description: "How to delete your KinWillow account and everything in your vault, and what is removed.",
};

// A public page describing account deletion. Both app stores require a web
// address, reachable without signing in, that explains how to delete an
// account and what data is removed.
export default function DeleteAccountPage() {
  return (
    <main className="page">
      <h1>Delete your KinWillow account</h1>
      <p className="sans">
        You can delete your account yourself at any time, in the app or on the website. You do not
        need to contact us.
      </p>

      <h2>How to delete it</h2>
      <ol className="sans" style={{ margin: "0 0 14px 22px", color: "#38443c" }}>
        <li>Sign in at <Link href="/login">kinwillow.com</Link> or in the KinWillow app.</li>
        <li>Open <strong>Settings</strong>.</li>
        <li>Choose <strong>Delete my account</strong> and confirm with your password.</li>
      </ol>
      <p className="sans">
        We email you a confirmation. Deletion takes effect after a 30-day grace period, during
        which you can sign in and cancel it from Settings.
      </p>

      <h2>What is deleted</h2>
      <ul className="sans">
        <li>Your vault: every item, note, location and instruction you entered</li>
        <li>Documents you uploaded</li>
        <li>Your trusted contacts, helpers, release scopes and emergency settings</li>
        <li>Your activity log</li>
        <li>Your sign-in account, name and email address</li>
      </ul>
      <p className="sans">
        Any paid plan is cancelled when the deletion is carried out. If you manage a vault for
        your parents, it is deleted with your account.
      </p>

      <h2>What we keep</h2>
      <p className="sans">
        Nothing from your vault. Payment records are held by our payment provider, Stripe, for as
        long as tax and accounting law requires. Copies in our hosting provider&rsquo;s routine
        backups are overwritten on its normal schedule and are not used for anything else.
      </p>

      <h2>If you can&rsquo;t sign in</h2>
      <p className="sans">
        Use <Link href="/forgot-password">Forgot your password?</Link> to get back in, or{" "}
        <Link href="/contact?topic=account-access">contact us</Link> from the email address on the
        account and we will help. If your plan has simply lapsed, your vault is sealed, not
        deleted — see our <Link href="/pledge">Continuity Pledge</Link>.
      </p>
    </main>
  );
}
