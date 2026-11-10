export const metadata = { title: "Terms of Service — KinWillow" };

export default function TermsPage() {
  return (
    <main className="page">
      <h1>Terms of Service</h1>
      <p className="sans" style={{ color: "var(--muted)", fontSize: 14 }}>
        Draft — last updated November 9, 2026. This draft is published with the Stage 2 preview and
        will be reviewed before the public launch of the vault.
      </p>
      <h2>1. The service</h2>
      <p>
        KinWillow provides a guided inventory and continuity-readiness service: it records where your
        accounts, subscriptions, documents, and devices live, tracks whether each provider&rsquo;s own
        legacy or recovery mechanism has been configured, and — under the rules you set — discloses
        recovery instructions to the trusted contacts you name.
      </p>
      <h2>2. What KinWillow is not</h2>
      <ul>
        <li>KinWillow is <strong>not a will</strong>, not legal advice, and not a law firm. It does not draft estate documents and does not replace them.</li>
        <li>KinWillow is <strong>not a password manager</strong>. Do not store passwords in it. It records where recovery lives, not the credentials themselves.</li>
        <li>KinWillow does not hold your assets, cannot access your accounts at other providers, and cannot unlock anything. Access to an account always happens through that provider&rsquo;s own process (for example, Apple&rsquo;s or Google&rsquo;s), under that provider&rsquo;s rules and applicable law such as RUFADAA.</li>
      </ul>
      <h2>3. Your responsibilities</h2>
      <p>
        You are responsible for the accuracy of what you record, for keeping your sign-in credentials
        and multi-factor authentication safe, and for keeping your trusted contacts and their scopes
        current. KinWillow&rsquo;s readiness indicators reflect the evidence and attestations you
        provide; they are organisational aids, not guarantees about any provider&rsquo;s behaviour.
      </p>
      <h2>4. Emergency disclosure</h2>
      <p>
        By naming a trusted contact you authorise KinWillow to disclose, to that contact, the
        recovery instructions in the scopes you assigned — only after a disclosure request completes
        the waiting period you configured without your veto, and only to the extent each record&rsquo;s
        verification state allows. You may change contacts, scopes, and the waiting period at any
        time while you can sign in.
      </p>
      <h2>5. Plans and billing</h2>
      <p>
        Paid plans are billed annually through Stripe. If a payment fails or a plan lapses, your
        household enters a <strong>sealed state</strong>: the vault is preserved, you can sign in to
        export your data or renew, and the emergency disclosure flow continues to operate for 12
        months after the lapse. Sealed vaults are never deleted for non-payment. You may delete your
        account at any time from Settings; deletion takes effect after a 30-day grace period and an
        opportunity to export.
      </p>
      <h2>6. Acceptable use</h2>
      <p>
        Do not use KinWillow to store other people&rsquo;s credentials, to attempt access to accounts
        you have no right to reach, or to misuse the emergency disclosure flow. We may suspend
        accounts that do, after notice where practicable.
      </p>
      <h2>7. Liability</h2>
      <p>
        The service is provided as an organisational tool. To the maximum extent permitted by law,
        KinWillow is not liable for a provider&rsquo;s refusal of access, for inaccuracies in records
        you entered, or for outcomes of an emergency in which the vault is used.
      </p>
      <h2>8. Changes</h2>
      <p>
        We may update these terms; material changes will be announced by email at least 30 days
        before they take effect. Questions: use the <a href="/contact">contact form</a>.
      </p>
    </main>
  );
}
