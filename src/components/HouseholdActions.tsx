"use client";

import { useState } from "react";

export type HouseholdRow = {
  id: string;
  name: string;
  plan_tier: string;
  status: string;
  waiting_period_hours: number;
  owner_email: string | null;
  members: number;
  created_at: string;
};

export default function HouseholdActions({ rows }: { rows: HouseholdRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function act(household_id: string, payload: Record<string, unknown>) {
    setBusy(household_id);
    await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id, ...payload }),
    });
    window.location.reload();
  }

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      (r.owner_email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="sans">
      <input
        placeholder="Search by household name or owner email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((r) => (
          <div key={r.id} className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <strong>{r.name}</strong> · {r.owner_email ?? "—"}
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Plan: {r.plan_tier} · Status: {r.status} · Wait: {Math.round(r.waiting_period_hours / 24)}d ·
                Members: {r.members} · Since {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={r.plan_tier}
                disabled={busy === r.id}
                onChange={(e) => act(r.id, { action: "set_plan", tier: e.target.value })}
              >
                <option value="free">free</option>
                <option value="family">family</option>
                <option value="family_parents">family_parents</option>
              </select>
              {r.status === "active" ? (
                <button className="btn secondary" disabled={busy === r.id} onClick={() => act(r.id, { action: "set_status", status: "sealed" })}>
                  Seal
                </button>
              ) : (
                <button className="btn secondary" disabled={busy === r.id} onClick={() => act(r.id, { action: "set_status", status: "active" })}>
                  Unseal
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p>No households match.</p>}
      </div>
    </div>
  );
}
