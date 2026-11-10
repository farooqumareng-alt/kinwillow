export default function SecurityPage() {
  return (
    <main className="narrow">
      <h1 style={{ fontSize: 34, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 14 }}>
        How KinWillow protects your vault
      </h1>
      <div className="sans" style={{ display: "grid", gap: 14 }}>
        <p>
          KinWillow is a map, not a safe full of keys. We never store your passwords — only where
          recovery lives: the provider&rsquo;s own legacy setting, who you named, and where the
          access key is physically kept.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>Encryption</h3>
        <p>
          Everything travels over HTTPS and is encrypted at rest. The two most sensitive fields —
          your recovery instructions and where your access keys are kept — get a second layer:
          they are encrypted with a key unique to your household before they are stored, and they
          are only decrypted inside your signed-in session or inside a recovery package you
          authorized. To be plain about the model: this is server-side encryption managed by
          KinWillow, not zero-knowledge encryption — we are working toward zero-knowledge options
          for specific scopes.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>Sign-in security</h3>
        <p>
          Accounts support multi-factor authentication with an authenticator app, and it is
          required before recovery instructions can be added. Sessions in the vault sign out
          automatically after inactivity.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>An activity log that can&rsquo;t quietly change</h3>
        <p>
          Every important event — evidence recorded, instructions viewed, exports, emergency
          requests and releases — is written to an append-only log in which each entry is
          cryptographically chained to the one before it. Changing a past entry would break the
          chain, visibly.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>Emergency release is gated, never instant</h3>
        <p>
          A trusted contact can only request access. A waiting period you choose (2–30 days,
          default 7) starts, you are notified, and you can veto at any time. What a package
          contains depends on each account&rsquo;s verified state — an account whose setup was
          never verified discloses less, and a revoked one discloses nothing.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>If billing lapses</h3>
        <p>
          Your vault is sealed, never deleted: it becomes read-only, your export stays available,
          and the emergency process keeps working. Deletion happens only at your explicit request,
          after a grace period.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>What we don&rsquo;t do</h3>
        <p>
          No advertising trackers in the vault. No sale of personal data. No custody of your
          assets, credentials, or keys — KinWillow cannot unlock your accounts, and we will never
          claim otherwise.
        </p>
      </div>
    </main>
  );
}
