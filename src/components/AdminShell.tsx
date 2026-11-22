import type { StaffGate, StaffContext } from "@/lib/admin";
import { can, ROLE_INFO, type Permission } from "@/lib/staff";

const LINKS: Array<{ href: string; label: string; needs: Permission }> = [
  { href: "/admin", label: "Overview", needs: "dashboard.view" },
  { href: "/admin/accounts", label: "Account lookup", needs: "accounts.view" },
  { href: "/admin/households", label: "Households", needs: "accounts.view" },
  { href: "/admin/inbox", label: "Inbox", needs: "inbox.manage" },
  { href: "/admin/log", label: "Staff log", needs: "log.view" },
  { href: "/admin/staff", label: "Staff", needs: "staff.manage" },
];

/** What a non-staff visitor, or staff without the right role, sees. */
export function AdminBlocked({ gate }: { gate: StaffGate | { status: "no_permission" } }) {
  if (gate.status === "needs_mfa") {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>One more step</h1>
        <p className="sans">
          Staff accounts must use an authenticator app. Turn it on under{" "}
          <a href="/app/security">Security</a>, then sign out and sign in again with the app&rsquo;s
          code.
        </p>
      </main>
    );
  }
  if (gate.status === "no_permission") {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>Not part of your role</h1>
        <p className="sans">
          Your staff role doesn&rsquo;t include this page. <a href="/admin">Back to the overview</a>
        </p>
      </main>
    );
  }
  return (
    <main className="narrow">
      <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>Not available</h1>
      <p className="sans">This page is not available.</p>
    </main>
  );
}

export function AdminHeader({ ctx, title }: { ctx: StaffContext; title: string }) {
  return (
    <>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>{title}</h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        Signed in as {ctx.email} · {ROLE_INFO[ctx.role].label}. Account details only — vault contents
        are never shown here, and what you do is recorded in the staff log.
      </p>
      <nav className="app-nav sans" style={{ marginBottom: 24 }}>
        {LINKS.filter((l) => can(ctx.role, l.needs)).map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
    </>
  );
}
