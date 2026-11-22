"use client";

import { useState } from "react";
import { runStaffAction } from "@/components/StaffAction";
import { ROLE_INFO, STAFF_ROLES, type StaffRole } from "@/lib/staff";

export type StaffRow = { user_id: string; email: string | null; name: string | null; role: StaffRole; isYou: boolean };

export default function StaffManager({ staff }: { staff: StaffRow[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setRoleFor(targetEmail: string, newRole: StaffRole | null, what: string) {
    setError("");
    setBusy(true);
    const result = await runStaffAction({ action: "staff_set_role", email: targetEmail, role: newRole }, what);
    if (result === null) {
      window.location.reload();
      return;
    }
    setError(result);
    setBusy(false);
  }

  return (
    <div className="sans">
      {error && <div className="error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
        {staff.map((s) => (
          <div key={s.user_id} className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <strong>{s.name || s.email}</strong>
              {s.isYou ? " (you)" : ""}
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {s.email} · {ROLE_INFO[s.role].label} — {ROLE_INFO[s.role].summary}
              </div>
            </div>
            {!s.isYou && s.email && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  aria-label={`Role for ${s.email}`}
                  value={s.role}
                  disabled={busy}
                  onChange={(e) =>
                    setRoleFor(s.email!, e.target.value as StaffRole, `Change ${s.email} to ${ROLE_INFO[e.target.value as StaffRole].label}.`)
                  }
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                  ))}
                </select>
                <button className="btn btn-secondary" disabled={busy} onClick={() => setRoleFor(s.email!, null, `Remove staff access from ${s.email}.`)}>
                  Remove access
                </button>
              </div>
            )}
          </div>
        ))}
        {staff.length === 0 && <p>No staff yet.</p>}
      </div>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          setRoleFor(email.trim(), role, `Give ${email.trim()} the ${ROLE_INFO[role].label} role.`);
        }}
      >
        <h3>Add a staff member</h3>
        <p style={{ marginBottom: 12 }}>
          They need a KinWillow account first (they sign up like any customer). They&rsquo;ll get an
          email, and must switch on an authenticator app before the staff panel opens for them.
        </p>
        <label htmlFor="staff-email">Their email</label>
        <input id="staff-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 420 }} />
        <label htmlFor="staff-role">Role</label>
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} style={{ maxWidth: 420 }}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_INFO[r].label} — {ROLE_INFO[r].summary}</option>
          ))}
        </select>
        <div>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>
            {busy ? "Saving…" : "Add staff member"}
          </button>
        </div>
      </form>
    </div>
  );
}
