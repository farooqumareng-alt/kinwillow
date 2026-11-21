"use client";
import { useEffect, useState } from "react";
import { listMyHouseholds, setActiveHousehold, type HouseholdInfo } from "@/lib/household";

type Summary = {
  is_partner: boolean;
  code?: string;
  link?: string;
  referred_total?: number;
  referred_paid?: number;
  discount_active?: boolean;
};

export default function PartnerPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<HouseholdInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/partner/summary");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSummary(json);
      } catch (e) {
        setError((e as Error).message || "Your partner details could not be loaded.");
        setSummary({ is_partner: false });
      }
      setClients((await listMyHouseholds()).filter((h) => h.role !== "owner"));
    })();
  }, []);

  async function copy() {
    if (!summary?.link) return;
    try {
      await navigator.clipboard.writeText(summary.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Your browser blocked copying. Select the link and copy it by hand.");
    }
  }

  function open(id: string) {
    setActiveHousehold(id);
    window.location.assign("/app");
  }

  if (summary === null) return <main><p className="sans muted" role="status">Loading…</p></main>;

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>Partner dashboard</h1>
      {error && <div className="error sans" role="alert" style={{ marginBottom: 18 }}>{error}</div>}

      {!summary.is_partner ? (
        <div className="panel sans" style={{ maxWidth: 620, marginTop: 18 }}>
          <h3>For professionals who help families get organised</h3>
          <p>
            Daily money managers, professional organisers, aging life care managers and estate
            attorneys can work in their clients&rsquo; vaults and share a referral link. Partner
            accounts are set up by KinWillow.
          </p>
          <p style={{ marginTop: 10 }}>
            <a className="btn" href="/partners#apply">Apply to be a partner</a>
          </p>
        </div>
      ) : (
        <>
          <p className="sans muted" style={{ marginBottom: 22, maxWidth: 660 }}>
            Share your link with clients. When a client wants your help inside their vault, they
            invite you from their Helpers page — you never see a vault unless its owner lets you in.
          </p>
          <div className="grid" style={{ marginBottom: 26 }}>
            <div className="panel sans">
              <h3>Your referral link</h3>
              <p><code>{summary.link}</code></p>
              <button className="btn small" style={{ marginTop: 10 }} onClick={copy}>
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              <p style={{ marginTop: 10, fontSize: 14 }}>
                Partner code: <strong>{summary.code}</strong>
                {summary.discount_active ? " · clients who sign up with it get the partner discount at checkout." : ""}
              </p>
            </div>
            <div className="panel sans">
              <h3>Signed up through your link</h3>
              <div className="score">{summary.referred_total ?? 0}</div>
              <p>
                account{summary.referred_total === 1 ? "" : "s"} created ·{" "}
                <strong>{summary.referred_paid ?? 0}</strong> on a paid plan
              </p>
            </div>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 22, marginBottom: 10 }}>Vaults you help with</h2>
      {clients.length === 0 ? (
        <p className="sans muted">
          None yet. A client adds you from <strong>Helpers</strong> in their own vault, using the
          email address you sign in with.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {clients.map((c) => (
            <div key={c.id} className="panel sans row" style={{ justifyContent: "space-between", padding: "16px 22px" }}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted" style={{ fontSize: 14 }}>
                  {c.grant_level === "edit" ? "You can add and change things" : "You can look only"}
                  {c.status === "sealed" ? " · sealed (read-only)" : ""}
                </div>
              </div>
              <button className="btn secondary small" onClick={() => open(c.id)}>Open this vault</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
