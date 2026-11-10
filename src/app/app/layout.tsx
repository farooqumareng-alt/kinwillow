import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="app-nav sans">
        <Link href="/app">Dashboard</Link>
        <Link href="/app/setup">Guided setup</Link>
        <Link href="/app/inventory">Your vault</Link>
        <Link href="/app/continuity">Continuity Centre</Link>
        <Link href="/app/contacts">Contacts & scopes</Link>
        <Link href="/app/emergency">Emergency</Link>
        <Link href="/app/billing">Billing</Link>
        <Link href="/app/settings">Settings</Link>
        <Link href="/app/security">Security (MFA)</Link>
        <span style={{ flex: 1 }} />
        <SignOutButton />
      </nav>
      {children}
    </div>
  );
}
