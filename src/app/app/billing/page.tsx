"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

type Sub = { tier: string | null; status: string | null; current_period_end: string | null } | null;

export default function BillingPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const h = await getMyHousehold();
      setHousehold(h);
      if (h) {
        const supabase = createClient();
        const { data } = await supabase.from("subscriptions").select("*").eq("household_id", h.id).single();
        setSub((data as Sub) ?? null);
      }
      setLoading(false);
    })();
  }, []);

  async function upgrade(tier: string) {
    if (!household) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id: household.id, tier }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !json.url) {
      setMsg(json.error ?? "Checkout is not available yet.");
      return;
    }
    window.location.href = json.url;
  }

  async function portal() {
    if (!household) return;
    setBusy(true);
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id: household.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !json.url) {
      setMsg(json.error ?? "No subscription on file.");
      return;
    }
    window.location.href = json.url;
  }

  if (loading) return <main><p className="sans">Loading…</p></main>;
  const tier = household?.plan_tier ?? "free";

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Plan &amp; billing
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        Current plan: <strong>{tier === "free" ? "Free" : tier === "family" ? "Family — $79/year" : "Family + Parents — $129/year"}</strong>
        {household?.status === "sealed" ? " · This household is sealed (read-only) because billing lapsed. Your vault is kept safe and your export is always available." : ""}
        {sub?.current_period_end ? ` · Renews ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}
      </p>

      <div className="grid">
        <div className="panel sans">
          <h3>Family — $79/year</h3>
          <p>Unlimited items, up to 5 trusted contacts, unlimited scopes.</p>
          {tier !== "family" && tier !== "family_parents" ? (
            <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => upgrade("family")}>
              Upgrade to Family
            </button>
          ) : (
            <p style={{ marginTop: 10 }}>Your current plan.</p>
          )}
        </div>
        <div className="panel sans">
          <h3>Family + Parents — $129/year</h3>
          <p>Everything in Family, plus a second vault for your parents, managed from your account.</p>
          {tier !== "family_parents" ? (
            <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => upgrade("family_parents")}>
              Upgrade to Family + Parents
            </button>
          ) : (
            <p style={{ marginTop: 10 }}>Your current plan.</p>
          )}
        </div>
        <div className="panel sans">
          <h3>Manage subscription</h3>
          <p>Update your card, see invoices, or cancel — handled securely by Stripe.</p>
          <button className="btn secondary" style={{ marginTop: 10 }} disabled={busy} onClick={portal}>
            Open billing portal
          </button>
        </div>
      </div>
      {msg && <p className="error sans" style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}
