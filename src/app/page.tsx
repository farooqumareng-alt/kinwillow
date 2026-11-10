import ChecklistForm from "@/components/ChecklistForm";

export default function Home() {
  return (
    <main>
      <div className="hero">
        <h1>
          If anything happens to you, <em>your family can find everything.</em>
        </h1>
        <p className="sub">
          KinWillow is a guided, secure vault where you organise — in about an hour — every account,
          subscription, document, and device your family would need, with clear instructions for the
          people you trust. Not your passwords. The map to everything.
        </p>
        <div className="cta-row sans">
          <a className="btn" href="#checklist">Get the free Family Continuity Checklist</a>
          <a className="btn btn-secondary" href="#concierge">Book a done-with-you setup</a>
        </div>
        <p className="trust sans">Encrypted · Never sold · Never used for advertising</p>
      </div>

      <section>
        <h2>The problem nobody plans for</h2>
        <p className="lede">
          Your whole life runs through accounts and devices. Almost none of it is written down
          anywhere your family could find.
        </p>
        <div className="stats">
          <div className="stat"><span className="num">168</span><p>online accounts for the average person — bank, email, photos, bills, everything</p></div>
          <div className="stat"><span className="num">1 in 4</span><p>adults has a will — and even a will doesn&rsquo;t say where the accounts are or how to get in</p></div>
          <div className="stat"><span className="num">Months</span><p>families spend hunting through phones, inboxes, and paperwork that a one-hour setup would have prevented</p></div>
        </div>
      </section>

      <section id="how">
        <h2>How KinWillow works</h2>
        <p className="lede">Three steps, about an hour, at your pace.</p>
        <div className="steps">
          <div className="step"><span className="n sans">1</span><h3>Build your vault</h3><p>A guided checklist walks you through accounts, subscriptions, documents, and devices — where each thing is, how billing works, and where password recovery lives. Never the passwords themselves.</p></div>
          <div className="step"><span className="n sans">2</span><h3>Name your people</h3><p>Choose trusted contacts and set exactly what each person can see, and when. In an emergency, they can request access — you&rsquo;re notified, and nothing is released instantly.</p></div>
          <div className="step"><span className="n sans">3</span><h3>Stay current automatically</h3><p>Renewal and expiry reminders keep the vault from going stale, and built-in guides walk you through switching on Apple, Google, and Meta legacy settings.</p></div>
        </div>
      </section>

      <section>
        <h2>What KinWillow is — and is not</h2>
        <p className="lede">Clear about its job, so your family can rely on it.</p>
        <div className="split">
          <div className="box is"><h3>KinWillow is</h3><ul>
            <li>The map that makes a will, an executor, and a grieving family actually able to act</li>
            <li>A living inventory that stays current with renewal reminders</li>
            <li>Instructions in plain English: cancel these, keep these photos, call this person first</li>
            <li>Shared only with the trusted contacts you name</li>
          </ul></div>
          <div className="box isnot"><h3>KinWillow is not</h3><ul>
            <li>A will — and it is not legal advice</li>
            <li>A password manager — it never stores your passwords</li>
            <li>Something your family has to figure out alone in a crisis</li>
          </ul></div>
        </div>
      </section>

      <section id="pricing">
        <h2>Simple, annual pricing</h2>
        <p className="lede">Annual plans only — this is a once-a-year job, and we price it that way. Monthly pricing invites the churn we&rsquo;re protecting you from.</p>
        <div className="pricing">
          <div className="tier"><h3>Free</h3><div className="price">$0</div><div className="per">to start</div><ul><li>Up to 25 items</li><li>1 trusted contact</li><li>Renewal alerts</li></ul></div>
          <div className="tier featured"><h3>Family</h3><div className="price">$79</div><div className="per">per year</div><ul><li>Unlimited items</li><li>3 trusted contacts</li><li>Emergency access</li><li>Legacy-setting guides</li></ul></div>
          <div className="tier"><h3>Family + Parents</h3><div className="price">$129</div><div className="per">per year</div><ul><li>Two households</li><li>Everything in Family</li><li>Set up your parents&rsquo; vault too</li></ul></div>
        </div>
        <p className="lede sans" style={{ marginTop: 26, fontSize: 15 }}>
          Coming next on the same account: <strong>Renewals</strong> — everything that expires, on one
          calendar — and <strong>Scam Shield</strong> — forward a suspicious message, and your family
          gets alerted.
        </p>
      </section>

      <div className="signup-block" id="checklist">
        <h2>Start with the free checklist</h2>
        <p>
          The Family Continuity Checklist is the paper version of the vault — 10 sections covering
          everything your family would need. Tell us where to send it, and it&rsquo;s yours.
        </p>
        <ChecklistForm />
        <div id="concierge" style={{ marginTop: 44, borderTop: "1px solid #35543f", paddingTop: 36 }}>
          <h2 style={{ fontSize: 26 }}>Prefer it done with you?</h2>
          <p>
            Book a founding setup session: we organise your entire vault with you over Zoom, in about
            an hour. <strong style={{ color: "#fff" }}>$29 deposit, fully refundable.</strong> Limited founding spots.
          </p>
          <a className="btn sans" href="https://buy.stripe.com/8x27sK8otfvt71j3lJgfu00" style={{ background: "#fff", color: "var(--green-dark)", fontWeight: "bold" }}>
            Request a setup session
          </a>
        </div>
      </div>
    </main>
  );
}
