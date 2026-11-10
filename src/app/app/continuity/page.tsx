"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";
import {
  STATE_LABELS,
  effectiveState,
  healthScore,
  type ContinuityRecord,
} from "@/lib/continuity";

type Provider = {
  id: string;
  name: string;
  mechanism_type: string;
  walkthrough: string[];
  accepts_confirmation: boolean;
  recheck_months: number;
  recovery_summary: string;
};

export default function ContinuityCentre() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [records, setRecords] = useState<ContinuityRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState("apple");
  const [accountRef, setAccountRef] = useState("");
  const [recipient, setRecipient] = useState("");
  const [criticality, setCriticality] = useState("high");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(hid: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("continuity_records")
      .select("*")
      .eq("household_id", hid)
      .order("created_at", { ascending: true });
    setRecords((data ?? []) as ContinuityRecord[]);
  }

  useEffect(() => {
    (async () => {
      const h = await getMyHousehold();
      setHousehold(h);
      const supabase = createClient();
      const { data: provs } = await supabase.from("provider_catalog").select("*").order("name");
      setProviders((provs ?? []) as Provider[]);
      if (h) await load(h.id);
      setLoading(false);
    })();
  }, []);

  const score = healthScore(records);
  const attention = records.filter((r) => {
    const s = effectiveState(r);
    return s === "stale" || s === "drift_suspected" || s === "not_started";
  });

  async function startCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/continuity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        household_id: household.id,
        provider_id: providerId,
        account_ref: accountRef || null,
        designated_recipient: recipient || null,
        criticality,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Could not start this check.");
      return;
    }
    window.location.href = `/app/continuity/${json.record.id}`;
  }

  if (loading) return <main><p className="sans">Loading…</p></main>;

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Continuity Centre
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24, maxWidth: 640 }}>
        For each important account, KinWillow walks you through the provider&rsquo;s own legacy
        setting, records the evidence, and keeps watch for drift — so your family&rsquo;s plan is
        verified, not just written down.
      </p>

      <div className="grid" style={{ marginBottom: 28 }}>
        <div className="panel">
          <h3>Readiness score</h3>
          <div className="score">{score === null ? "—" : `${score}%`}</div>
          <p>{records.length} account{records.length === 1 ? "" : "s"} being tracked.</p>
        </div>
        <div className="panel">
          <h3>Needs attention</h3>
          {attention.length === 0 ? (
            <p>Nothing needs attention right now.</p>
          ) : (
            <ul className="sans" style={{ paddingLeft: 18 }}>
              {attention.map((r) => {
                const p = providers.find((x) => x.id === r.provider_id);
                return (
                  <li key={r.id}>
                    <a href={`/app/continuity/${r.id}`}>{p?.name ?? r.provider_id}</a> —{" "}
                    {STATE_LABELS[effectiveState(r)]}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 22, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 12 }}>
        Your legacy checks
      </h2>
      {records.length === 0 ? (
        <p className="sans" style={{ marginBottom: 24 }}>
          None yet. Start with the account your family would need first — usually Apple or Google.
        </p>
      ) : (
        <div style={{ marginBottom: 28 }}>
          {records.map((r) => {
            const p = providers.find((x) => x.id === r.provider_id);
            const s = effectiveState(r);
            return (
              <div key={r.id} className="panel sans" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <a href={`/app/continuity/${r.id}`} style={{ fontWeight: "bold" }}>
                    {p?.name ?? r.provider_id}
                  </a>{" "}
                  · {p?.mechanism_type}
                  {r.account_ref ? ` · ${r.account_ref}` : ""}
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>
                    {r.designated_recipient ? `Contact: ${r.designated_recipient} · ` : ""}
                    {r.recheck_due ? `Re-check by ${r.recheck_due}` : "No re-check scheduled"}
                  </div>
                </div>
                <span className="chip">{STATE_LABELS[s]}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel">
        <h3>Start a legacy check</h3>
        <form onSubmit={startCheck} className="sans" style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label>
            Provider
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.mechanism_type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Which account? (e.g. the email or username — never a password)
            <input value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            Trusted person for this account
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Full name" />
          </label>
          <label>
            How important is this account?
            <select value={criticality} onChange={(e) => setCriticality(e.target.value)}>
              <option value="high">High — family would need this first</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          {msg && <p className="error">{msg}</p>}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Starting…" : "Start the walkthrough"}
          </button>
        </form>
      </div>
    </main>
  );
}
