import Link from "next/link";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/setup", label: "Guided setup" },
  { href: "/app/inventory", label: "Your vault" },
  { href: "/app/continuity", label: "Continuity Centre" },
  { href: "/app/contacts", label: "Contacts & scopes" },
  { href: "/app/emergency", label: "Emergency" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/security", label: "Security (MFA)" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell app-shell--sidebar">
      <aside className="app-sidebar sans">
        <nav className="app-nav app-nav--sidebar" aria-label="Vault menu">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="app-content">{children}</div>
    </div>
  );
}
