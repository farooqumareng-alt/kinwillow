"use client";

import { useState } from "react";
import { runStaffAction } from "@/components/StaffAction";

export type HouseholdRow = {
  id: string;
  name: string;
  plan_tier: string;
  status: string;
  waiting_period_hours: number;
  owner_email: string | null;
  owner_id: string;
  owner_is_partner: boolean;
  owner_partner_code: string | null;
  members: number;
  created_at: string;
};

const PLAN_LABEL: Record<string, string> = { free: "Free", family: "Family", family_parents: "Family + Parents" };

export default function HouseholdActions({
  rows,
  canBilling,
  canPartners,
}: {
  rows: HouseholdRow[];
  canBilling: boolean;
  canPartners: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function act(householdId: string, payload: Record<string, unknown>, what: string) {
    setError("");
    setBusy(householdId);
    const result = await runStaffAction({ household_id: householdId, ...payload }, what);
    if (result === null) {
      window.location.reload();
      return;
    }
    setError(result);
    setBusy(null);
  }

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      (r.owner_email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="sans">
      <input
        aria-label="Search households"
        placeholder="Search by household name or owner email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />
      {error && <div className="error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((r) => (
          <div key={r.id} className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <strong>{r.name}</strong> ·{" "}
              <a href={`/admin/accounts?id=${r.owner_id}`}>{r.owner_email ?? "—"}</a>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Plan: {PLAN_LABEL[r.plan_tier] ?? r.plan_tier} · Status: {r.status} · Waiting period:{" "}
                {Math.round(r.waiting_period_hours / 24)} days · Members: {r.members} · Since{" "}
                {new Date(r.created_at).toLocaleDateString()}
                {r.owner_is_partner ? ` · Partner (code ${r.owner_partner_code})` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {canBilling && (
                <select
                  aria-label={`Plan for ${r.name}`}
                  value={r.plan_tier}
                  disabled={busy === r.id}
                  onChange={(e) =>
                    act(r.id, { action: "set_plan", tier: e.target.value }, `Change ${r.name} to ${PLAN_LABEL[e.target.value]}.`)
                  }
                >
                  <option value="free">Free</option>
                  <option value="family">Family</option>
                  <option value="family_parents">Family + Parents</option>
                </select>
              )}
              {canPartners && (
                <button
                  className="btn btn-secondary"
                  disabled={busy === r.id}
                  onClick={() =>
                    act(
                      r.id,
                      { action: "set_partner", user_id: r.owner_id, is_partner: !r.owner_is_partner },
                      r.owner_is_partner ? `Remove partner status from ${r.owner_email}.` : `Make ${r.owner_email} a partner.`
                    )
                  }
                >
                  {r.owner_is_partner ? "Remove partner" : "Make partner"}
                </button>
              )}
              {canBilling &&
                (r.status === "active" ? (
                  <button
                    className="btn btn-secondary"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, { action: "set_status", status: "sealed" }, `Seal ${r.name} (make it read-only).`)}
                  >
                    Seal
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, { action: "set_status", status: "active" }, `Unseal ${r.name}.`)}
                  >
                    Unseal
                  </button>
                ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p>No households match.</p>}
      </div>
    </div>
  );
}
