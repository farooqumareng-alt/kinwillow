import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "KinWillow for professionals — partner with us",
  description:
    "For daily money managers, professional organisers, aging life care managers and estate attorneys: work inside your clients' KinWillow vaults, with their permission, and leave every family with a plan they can actually find.",
};

export default function PartnersPage() {
  return (
    <main>
      <div className="hero" style={{ paddingBottom: 30 }}>
        <h1>
          You already do the hard part. <em>Give it somewhere to live.</em>
        </h1>
        <p className="sub">
          You help families get their affairs in order. KinWillow is where that work stays current
          and reaches the right people when it&rsquo;s needed — without you holding a single password.
        </p>
        <div className="cta-row sans">
          <a className="btn" href="#apply">Apply to be a partner</a>
          <Link className="btn btn-secondary" href="/security">How vaults are protected</Link>
        </div>
      </div>

      <section style={{ paddingTop: 30 }}>
        <h2>Who it&rsquo;s for</h2>
        <p className="lede">
          Professionals who sit at the kitchen table with clients: daily money managers,
          professional organisers, aging life care managers, senior move managers, end-of-life
          doulas, and estate and elder-law practices.
        </p>
        <div className="steps">
          <div className="step">
            <span className="n sans">1</span>
            <h3>Your client owns the vault</h3>
            <p>
              They create a free account — through your link, if you like — and invite you as a
              helper from inside it. Nothing is shared with you until they do.
            </p>
          </div>
          <div className="step">
            <span className="n sans">2</span>
            <h3>You do the setup together</h3>
            <p>
              Work through the ten-section checklist in their vault: where each account, document
              and device is, and how recovery works. Locations and instructions, never passwords.
            </p>
          </div>
          <div className="step">
            <span className="n sans">3</span>
            <h3>It keeps working after you leave</h3>
            <p>
              Renewal reminders, a yearly review and a printable binder keep it true. In an
              emergency, the trusted contacts your client named receive it — not you.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>What a partner gets</h2>
        <div className="split">
          <div className="box is">
            <h3>Included</h3>
            <ul>
              <li>A complimentary KinWillow account for your own household, so you know the product from the inside</li>
              <li>A personal referral link, and a preferential rate for clients who sign up through it</li>
              <li>A partner dashboard: the client vaults you help with, and how many clients joined</li>
              <li>Access your client can see, limit to &ldquo;look only&rdquo;, and end at any time</li>
            </ul>
          </div>
          <div className="box isnot">
            <h3>Deliberately not included</h3>
            <ul>
              <li>Any way to see a vault its owner hasn&rsquo;t invited you into</li>
              <li>The power to release information, veto an emergency request, or change billing — those stay with the owner</li>
              <li>Custody of credentials or assets: KinWillow never stores passwords, and neither should you</li>
            </ul>
          </div>
        </div>
        <p className="lede sans" style={{ marginTop: 26, fontSize: 15 }}>
          Everything you view or change in a client&rsquo;s vault is recorded in their activity log.
          Our commitments to every family are in the <Link href="/pledge">Continuity Pledge</Link>.
        </p>
      </section>

      <section id="apply" style={{ paddingTop: 20 }}>
        <h2>Apply to be a partner</h2>
        <p className="lede">
          We&rsquo;re working with a small number of practices to begin with, and read every
          application ourselves. Tell us a little about your work.
        </p>
        <ContactForm mode="partner" />
        <p className="sans" style={{ textAlign: "center", fontSize: 13.5, color: "var(--muted)", marginTop: 16 }}>
          KinWillow is not a law firm and does not provide legal, financial or tax advice.
        </p>
      </section>
    </main>
  );
}
