import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site sans">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-symbol.png" alt="KinWillow" style={{ height: 58, width: "auto", marginBottom: 10 }} />
      <p>
        <strong>KinWillow</strong> · Everything your family would need, in one safe place.
      </p>
      <p style={{ marginTop: 8 }}>
        KinWillow is not a law firm and does not provide legal advice. It is an organisational tool
        that works alongside your will and estate documents.
      </p>
      <p style={{ marginTop: 8 }}>
        © 2026 KinWillow · <Link href="/contact">Contact us</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
        <Link href="/terms">Terms</Link>
      </p>
    </footer>
  );
}
