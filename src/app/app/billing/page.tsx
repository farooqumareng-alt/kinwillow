"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, getOwnHousehold, type HouseholdInfo } from "@/lib/household";
import { inStoreApp } from "@/lib/store-app";

type Sub = { tier: string | null; status: string | null; current_period_end: string | null } | null;

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  family: "Family — $79/year",
  family_parents: "Family + Parents — $129/year",
};

export default function BillingPage() {
  // Billing always belongs to the user's own household, whichever vault they
  // happen to be working in.
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [viewingParents, setViewingParents] = useState(false);
  const [sub, setSub] = useState<Sub>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeApp, setStoreApp] = useState(false);

  async function load() {
    const own = await getOwnHousehold();
    setHousehold(own);
    setViewingParents((await getMyHousehold())?.kind === "parents");
    if (own) {
      const supabase = createClient();
      const { data } = await supabase.from("subscriptions").select("*").eq("household_id", own.id).maybeSingle();
      setSub((data as Sub) ?? null);
    }
    return own;
  }

  useEffect(() => {
    (async () => {
      setStoreApp(inStoreApp());
      const params = new URLSearchParams(window.location.search);
      const own = await load();
      setLoading(false);
      if (params.get("upgraded") === "1") {
        setMsg("Thank you — your payment went through.");
        // Stripe tells us about the new plan a moment after you return.
        for (let i = 0; i < 6 && own?.plan_tier === "free"; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          if ((await load())?.plan_tier !== "free") break;
        }
      }
    })();
  }, []);

  const hasLivePlan = Boolean(sub && ["active", "trialing", "past_due"].includes(sub.status ?? ""));

  async function upgrade(tier: string) {
    if (!household) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    setConfirm(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id: household.id, tier }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.updated) {
      setMsg("Your plan has been changed. It can take a few seconds to show here.");
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if ((await load())?.plan_tier === tier) break;
      }
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!res.ok || !json.url) {
      setError(json.error ?? "Checkout is not available yet.");
      return;
    }
    window.location.href = json.url;
  }

  async function portal() {
    if (!household) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id: household.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !json.url) {
      setError(json.error ?? "No subscription on file.");
      return;
    }
    window.location.href = json.url;
  }

  if (loading) return <main><p className="sans muted" role="status">Loading…</p></main>;
  const tier = household?.plan_tier ?? "free";

  if (storeApp) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Your plan</h1>
        <div className="panel sans" style={{ maxWidth: 620, marginTop: 18 }}>
          <h3>{PLAN_NAMES[tier]?.split(" — ")[0] ?? tier}</h3>
          <p>
            {tier === "free"
              ? "You are on the Free plan: up to 25 items and 1 trusted contact."
              : "Your plan is active on this account, on every device you sign in on."}
            {household?.status === "sealed" ? " Your vault is currently sealed (read-only)." : ""}
          </p>
          <p style={{ marginTop: 10 }}>Plans can&rsquo;t be bought or changed in this app.</p>
        </div>
      </main>
    );
  }

  // With a live plan, switching changes the existing subscription and Stripe
  // charges or credits the difference — so ask first.
  const planButton = (target: string, label: string) =>
    hasLivePlan ? (
      confirm === target ? (
        <div style={{ marginTop: 10 }}>
          <p>
            {target === "family_parents"
              ? "Your plan changes now and your card is charged the difference for the rest of this billing year."
              : "Your plan changes now and the unused difference is credited to your next invoice. Your parents’ vault becomes read-only."}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" disabled={busy} onClick={() => upgrade(target)}>
              {busy ? "Changing…" : "Confirm change"}
            </button>
            <button className="link-btn muted" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => setConfirm(target)}>
          {label}
        </button>
      )
    ) : (
      <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => upgrade(target)}>
        {busy ? "Opening checkout…" : label}
      </button>
    );

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>Plan &amp; billing</h1>
      <p className="sans muted" style={{ marginBottom: 24, maxWidth: 680 }}>
        Current plan: <strong>{PLAN_NAMES[tier] ?? tier}</strong>
        {sub?.current_period_end && hasLivePlan ? ` · Renews ${new Date(sub.current_period_end).toLocaleDateString(undefined, { dateStyle: "long" })}` : ""}
        {household?.status === "sealed" ? " · Sealed (read-only) because billing lapsed. Your vault is kept safe and your export is always available." : ""}
        {viewingParents ? " · One plan covers both your vault and your parents’." : ""}
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 18 }}>{msg}</div>}
      {error && <div className="error sans" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>{error}</div>}

      <div className="grid">
        <div className="panel sans">
          <h3>Family — $79/year</h3>
          <p>Unlimited items, up to 5 trusted contacts, unlimited scopes.</p>
          {tier === "family" ? (
            <p style={{ marginTop: 10 }}><span className="chip good">Your current plan</span></p>
          ) : (
            planButton("family", tier === "family_parents" ? "Switch to Family" : "Upgrade to Family")
          )}
        </div>
        <div className="panel sans">
          <h3>Family + Parents — $129/year</h3>
          <p>
            Everything in Family, plus a second, separate vault for your parents — its own items,
            contacts and emergency settings — managed from your account.
          </p>
          {tier === "family_parents" ? (
            <p style={{ marginTop: 10 }}>
              <span className="chip good">Your current plan</span> Set up or open your parents&rsquo;
              vault from the box above the menu.
            </p>
          ) : (
            planButton("family_parents", "Upgrade to Family + Parents")
          )}
        </div>
        <div className="panel sans">
          <h3>Manage subscription</h3>
          <p>Update your card, see invoices, or cancel — handled securely by Stripe.</p>
          {sub ? (
            <button className="btn secondary" style={{ marginTop: 10 }} disabled={busy} onClick={portal}>
              Open billing portal
            </button>
          ) : (
            <p style={{ marginTop: 10 }}>You have no paid subscription yet, so there is nothing to manage.</p>
          )}
        </div>
      </div>
    </main>
  );
}
