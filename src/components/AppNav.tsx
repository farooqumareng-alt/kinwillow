"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/setup", label: "Guided setup" },
  { href: "/app/inventory", label: "Your vault" },
  { href: "/app/continuity", label: "Continuity Centre" },
  { href: "/app/contacts", label: "Contacts & scopes" },
  { href: "/app/helpers", label: "Helpers" },
  { href: "/app/emergency", label: "Emergency" },
  { href: "/app/review", label: "Annual review" },
  { href: "/app/activity", label: "Activity log" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/security", label: "Security" },
];

export default function AppNav() {
  const pathname = usePathname();
  // Vault pages are rendered in the browser, so the tab title is set here.
  useEffect(() => {
    const here = [...LINKS].reverse().find((l) => (l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href)));
    document.title = `${here?.label ?? "Your vault"} — KinWillow`;
  }, [pathname]);
  return (
    <nav className="app-nav app-nav--sidebar" aria-label="Vault menu">
      {LINKS.map((l) => {
        const current = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
