import Link from "next/link";
import { headers } from "next/headers";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

/** Pages a trusted contact opens, possibly while grieving: no marketing around them. */
export async function isCalmPage(): Promise<boolean> {
  const path = (await headers()).get("x-kw-path") ?? "";
  return path.startsWith("/package/") || path.startsWith("/request-access/");
}

function Logo() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-symbol.png" alt="" style={{ height: 48, width: "auto", display: "block" }} />
      <span style={{ color: "inherit" }}>
        Kin<span>Willow</span>
      </span>
    </>
  );
}

export default async function SiteHeader() {
  if (await isCalmPage()) {
    return (
      <header className="site calm">
        <div className="logo">
          <Logo />
        </div>
      </header>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  return (
    <header className="site">
      <Link className="logo" href="/" aria-label="KinWillow home">
        <Logo />
      </Link>
      <nav className="site sans" aria-label="Site">
        <a href="/#how" className="optional">How it works</a>
        <a href="/#pricing">Pricing</a>
        <a href="/#checklist" className="optional">Free checklist</a>
        {signedIn ? (
          <>
            <Link href="/app" style={{ fontWeight: "bold" }}>My vault</Link>
            <span>
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
