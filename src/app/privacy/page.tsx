export const metadata = { title: "Privacy Policy — KinWillow" };

export default function PrivacyPage() {
  return (
    <main className="page">
      <h1>Privacy Policy</h1>
      <p className="sans" style={{ color: "var(--muted)", fontSize: 14 }}>
        Draft — last updated November 9, 2026. This draft is published with the Stage 2 preview and
        will be reviewed before the public launch of the vault.
      </p>
      <h2>What KinWillow is</h2>
      <p>
        KinWillow is a continuity and readiness tool. You record where your accounts, subscriptions,
        documents, and devices live, how recovery works for each, and who should be able to find that
        map in an emergency. <strong>KinWillow never stores your passwords</strong>, never holds your
        assets, and never executes transfers.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, and sign-in credentials (stored by our authentication provider as salted hashes — we never see your password).</li>
        <li>Vault content you enter: inventory items, recovery instructions, where access keys are physically located, documents you upload, trusted-contact details, and the verification state of your providers&rsquo; legacy settings.</li>
        <li>Billing details: handled by Stripe. We receive your plan, status, and the last four digits of a card — never the full number.</li>
        <li>Basic technical data needed to run the service (such as sign-in events and error logs).</li>
      </ul>
      <h2>How vault content is protected</h2>
      <p>
        Data is encrypted in transit and at rest. Your most sensitive fields — recovery instructions
        and access-key locations — are additionally encrypted with a key unique to your household
        before they are stored. As a server-side service, KinWillow&rsquo;s systems can decrypt that
        content only to show it to you while you are signed in, or to generate the recovery package
        your trusted contact receives after an authorised emergency disclosure. Every view of
        recovery instructions is written to a tamper-evident audit log.
      </p>
      <h2>What we never do</h2>
      <ul>
        <li>We never sell your data. Ever.</li>
        <li>We never use your data for advertising, and the app carries no advertising trackers.</li>
        <li>We never share vault content with anyone except the trusted contacts you name, under the disclosure rules you configure.</li>
      </ul>
      <h2>Emergency disclosure</h2>
      <p>
        A trusted contact may request access if something happens to you. You are notified
        immediately and can veto the request at any time during the waiting period you set (default
        7 days). Nothing is released instantly, and what is released is limited to the scope you
        assigned that contact and the verification state of each record.
      </p>
      <h2>If your account lapses</h2>
      <p>
        Your vault is sealed, never deleted, when a subscription lapses — see the Terms for the full
        sealed-retention policy. You can export everything you entered, at any time, from Settings.
      </p>
      <h2>Your choices</h2>
      <p>
        You may export your data or delete your account from Settings. Deletion is permanent after a
        30-day grace period. Questions: use the <a href="/contact">contact form</a>.
      </p>
    </main>
  );
}
