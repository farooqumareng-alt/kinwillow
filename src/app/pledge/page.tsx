import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The KinWillow Continuity Pledge",
  description:
    "What happens to your vault if you stop paying, or if KinWillow ever closes: our written commitments to account owners and their trusted contacts.",
};

// The public continuity pledge. These are commitments, not marketing copy:
// change the wording only together with the product behaviour it describes.
export default function PledgePage() {
  return (
    <main className="page">
      <h1>The KinWillow Continuity Pledge</h1>
      <p className="sans">
        You are trusting us with something your family may need years from now, possibly when you
        can no longer speak for yourself. A fair question is: what if KinWillow isn&rsquo;t there?
        These are our commitments.
      </p>

      <h2>1. Your vault is always yours to take away</h2>
      <p className="sans">
        You can download everything in your vault at any time, and print the whole of it as a paper
        binder, from Settings. Both are free on every plan and stay available if your plan lapses.
        We recommend keeping a printed copy somewhere safe, and telling your trusted contact where
        it is.
      </p>

      <h2>2. If you stop paying, nothing is deleted</h2>
      <p className="sans">
        A vault whose plan lapses is sealed, not removed. You can still sign in, read it, export it
        and print it; you cannot add to it until you renew. Your trusted contacts can still request
        access, and the emergency process keeps working, for at least 12 months after the lapse.
      </p>

      <h2>3. If KinWillow ever closes, you and your trusted contacts are told</h2>
      <p className="sans">
        If we ever decide to shut the service down, we will give at least <strong>90 days&rsquo;
        written notice by email</strong> to every account owner <strong>and to every trusted
        contact</strong> named in a vault. We tell trusted contacts as well because the person who
        set up a vault may no longer be able to read our email. Sign-in, export, printing and the
        emergency process will keep working throughout those 90 days.
      </p>

      <h2>4. If KinWillow is ever sold, this pledge goes with it</h2>
      <p className="sans">
        We will only transfer the service to an organisation that agrees in writing to keep this
        pledge. If the service you signed up for would change in a way that breaks it, we will
        treat that as a closure and give you the 90 days&rsquo; notice in point 3.
      </p>

      <h2>5. Deletion only ever happens because you asked</h2>
      <p className="sans">
        We delete a vault only at its owner&rsquo;s request, made from Settings with their
        password, and only after a 30-day grace period in which they can change their mind.
      </p>

      <h2>6. We hold the map, never the keys</h2>
      <p className="sans">
        KinWillow does not store your passwords and cannot open your accounts. Your information is
        never sold and never used for advertising. How it is protected is set out on our{" "}
        <Link href="/security">Security page</Link>.
      </p>

      <h2>7. We won&rsquo;t quietly weaken this pledge</h2>
      <p className="sans">
        If we ever need to change these commitments in a way that reduces them, we will email every
        account owner at least 90 days before the change takes effect.
      </p>

      <p className="sans" style={{ color: "var(--muted)", fontSize: 14, marginTop: 30 }}>
        This pledge sits alongside our <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>. KinWillow is not a law firm and does not
        provide legal advice. Questions: <Link href="/contact">contact us</Link>.
      </p>
    </main>
  );
}
