import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page" style={{ textAlign: "center" }}>
      <h1>We couldn&rsquo;t find that page</h1>
      <p className="sans">The link may be old or mistyped. Nothing in your vault has changed.</p>
      <p className="sans" style={{ marginTop: 22 }}>
        <Link className="btn" href="/">Go to the home page</Link>
      </p>
      <p className="sans" style={{ marginTop: 14 }}>
        <Link href="/app">Open my vault</Link> · <Link href="/contact">Contact us</Link>
      </p>
    </main>
  );
}
