import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site">
      <Link className="logo" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-symbol.png" alt="KinWillow logo" style={{ height: 48, width: "auto", display: "block" }} />
        <span style={{ color: "inherit" }}>
          Kin<span>Willow</span>
        </span>
      </Link>
      <nav className="site sans">
        <a href="/#how">How it works</a>
        <a href="/#pricing">Pricing</a>
        <a href="/#checklist">Free checklist</a>
        <Link href="/login">Sign in</Link>
        <Link href="/signup" style={{ fontWeight: "bold" }}>Start free</Link>
      </nav>
    </header>
  );
}
