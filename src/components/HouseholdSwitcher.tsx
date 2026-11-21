"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyHousehold, listMyHouseholds, setActiveHousehold, type HouseholdInfo } from "@/lib/household";

// Shown above the vault menu. With one household it only names it; on
// Family + Parents it switches between your own vault and your parents'.
export default function HouseholdSwitcher() {
  const [households, setHouseholds] = useState<HouseholdInfo[]>([]);
  const [active, setActive] = useState<HouseholdInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setHouseholds(await listMyHouseholds());
      setActive(await getMyHousehold());
    })();
  }, []);

  function switchTo(id: string) {
    setActiveHousehold(id);
    // Full navigation: every page reloads its data for the chosen vault.
    window.location.assign("/app");
  }

  async function createParents(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/households/parents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.household_id) {
      setError(json.error ?? "Could not create the vault. Please try again.");
      setBusy(false);
      return;
    }
    switchTo(json.household_id);
  }

  if (!active) return null;
  const own = households.find((h) => h.kind === "own");
  const hasParents = households.some((h) => h.kind === "parents");
  const canAddParents = own?.plan_tier === "family_parents" && own.status === "active" && !hasParents;

  return (
    <div className="panel sans" style={{ padding: "14px 20px", marginBottom: 14 }}>
      {households.length > 1 ? (
        <label style={{ fontSize: 13, color: "var(--muted)" }}>
          You are working in
          <select value={active.id} onChange={(e) => switchTo(e.target.value)} style={{ fontSize: 15 }}>
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.kind === "parents" ? " (parents)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>You are working in</div>
          <div style={{ fontSize: 15, color: "var(--green-dark)", fontWeight: "bold" }}>{active.name}</div>
        </>
      )}

      {canAddParents && !creating && (
        <button className="link-btn" style={{ fontSize: 14, marginTop: 10, textAlign: "left" }} onClick={() => setCreating(true)}>
          + Set up your parents&rsquo; vault
        </button>
      )}
      {canAddParents && creating && (
        <form onSubmit={createParents} style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label style={{ fontSize: 13 }}>
            Name for their vault
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mum & Dad"
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            A separate vault with its own items, contacts and emergency settings. You manage it from
            this account and can switch between the two here.
          </p>
          {error && <div className="error" role="alert" style={{ marginTop: 0 }}>{error}</div>}
          <div className="row">
            <button className="btn small" type="submit" disabled={busy}>{busy ? "Creating…" : "Create vault"}</button>
            <button type="button" className="link-btn muted" style={{ fontSize: 14 }} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}
      {!hasParents && own && own.plan_tier !== "family_parents" && households.length === 1 && (
        <p style={{ fontSize: 13, marginTop: 8 }}>
          Looking after your parents too? <Link href="/app/billing">Add their vault</Link>
        </p>
      )}
    </div>
  );
}
