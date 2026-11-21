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
          Everything travels over HTTPS, and our database and file storage are encrypted at rest
          by our hosting providers. The two most sensitive fields — your recovery instructions and
          where your access keys are kept — get a second layer, as does every released recovery
          package: they are encrypted with a key unique to your household before they are stored,
          and are only decrypted inside your signed-in session or for the trusted contact a
          package was released to. To be plain about the model: this is server-side encryption
          managed by KinWillow, not zero-knowledge encryption. Our systems hold the keys, which is
          what lets a package reach your family when you can&rsquo;t act.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>Sign-in security</h3>
        <p>
          Every sign-in needs two things: your password and a one-time code we email you. A
          password alone opens nothing. You can also switch on an authenticator app; once it is
          on, its code is required at every sign-in as well. The vault signs you out after 30
          minutes without activity.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>An activity log that can&rsquo;t quietly change</h3>
        <p>
          Every important event — evidence recorded, instructions viewed, exports, emergency
          requests and releases — is written to an append-only log in which each entry is
          cryptographically chained to the one before it. Entries cannot be edited or removed, and
          you can read the whole log from inside your vault.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>Emergency release is gated, never instant</h3>
        <p>
          A trusted contact can only request access. A waiting period you choose (2–30 days,
          default 7) starts; you are emailed at once and reminded before it ends, and you can veto
          at any time. If you don&rsquo;t, the package is released to that contact automatically —
          so it still works when you can&rsquo;t act. It contains the vault items, documents and
          legacy-setting instructions you put in that contact&rsquo;s scope, and each legacy
          setting is labelled with how well it was confirmed. A revoked one discloses nothing. If
          our notice to you cannot be sent, nothing is released.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>If billing lapses</h3>
        <p>
          Your vault is sealed, never deleted: it becomes read-only, your export stays available,
          and the emergency process keeps working. Deletion happens only at your explicit request
          from Settings, after a 30-day grace period in which you can change your mind.
        </p>
        <h3 style={{ color: "var(--green-dark)" }}>If KinWillow itself ever closes</h3>
        <p>
          You and your trusted contacts get at least 90 days&rsquo; notice, and your export and
          printable binder stay available throughout. The full commitments are in our{" "}
          <a href="/pledge">Continuity Pledge</a>.
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
