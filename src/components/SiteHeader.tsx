import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export default async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

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
        {signedIn ? (
          <>
            <Link href="/app" style={{ fontWeight: "bold" }}>My vault</Link>
            <span style={{ marginLeft: 26 }}>
              <SignOutButton />
            </span>
          </>
        ) : (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/signup" style={{ fontWeight: "bold" }}>Start free</Link>
          </>
        )}
      </nav>
    </header>
  );
}
