"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold } from "@/lib/household";
import { SECTIONS } from "@/lib/sections";
import { effectiveState, type VerifiedState } from "@/lib/continuity";
import { friendlyError } from "@/lib/errors";
import { agoPhrase, isDueForReview } from "@/lib/review";

type Item = {
  id: string;
  title: string;
  section: number | null;
  provider_name: string | null;
  location: string | null;
  renewal_date: string | null;
  reviewed_at: string | null;
};

export default function ReviewPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [overdueChecks, setOverdueChecks] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const household = await getMyHousehold();
    if (!household) {
      setItems([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, title, section, provider_name, location, renewal_date, reviewed_at")
      .eq("household_id", household.id)
      .eq("archived", false)
      .order("reviewed_at", { ascending: true });
    if (error) {
      // The reviewed_at column arrives with migration 000015.
      setUnavailable(true);
      setItems([]);
      return;
    }
    setItems((data ?? []) as Item[]);
    const { data: recs } = await supabase
      .from("continuity_records")
      .select("verified_state, recheck_due")
      .eq("household_id", household.id);
    setOverdueChecks(
      ((recs ?? []) as Array<{ verified_state: VerifiedState; recheck_due: string | null }>).filter(
        (r) => effectiveState(r) === "stale"
      ).length
    );
  }
  useEffect(() => {
    load();
  }, []);

  async function confirm(ids: string[], key: string, label: string) {
    setBusy(key);
    setError("");
    setMsg("");
    const { error } = await createClient()
      .from("inventory_items")
      .update({ reviewed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) setError(friendlyError(error.message));
    else setMsg(label);
    await load();
    setBusy("");
  }

  if (items === null) return <main><p className="sans muted" role="status">Loading…</p></main>;

  if (unavailable) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Annual review</h1>
        <p className="sans muted">The annual review isn&rsquo;t available yet. Please check back shortly.</p>
      </main>
    );
  }

  const due = items.filter((i) => isDueForReview(i.reviewed_at));
  const current = items.length - due.length;
  const groups = [
    ...SECTIONS.map((s) => ({ key: String(s.n), title: s.title, items: due.filter((i) => i.section === s.n) })),
    { key: "other", title: "Other items", items: due.filter((i) => i.section == null) },
  ].filter((g) => g.items.length > 0);

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>Annual review</h1>
      <p className="sans muted" style={{ marginBottom: 20, maxWidth: 660 }}>
        A vault is only useful if it&rsquo;s still true. Once a year, look over anything you
        haven&rsquo;t touched and confirm it — or fix it. Editing an item counts as confirming it.
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 18 }}>{msg}</div>}
      {error && <div className="error sans" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>{error}</div>}

      <div className="grid" style={{ marginBottom: 26 }}>
        <div className="panel sans">
          <h3>Vault items</h3>
          <div className="score">{items.length === 0 ? "—" : `${Math.round((current / items.length) * 100)}%`}</div>
          <p>
            {items.length === 0
              ? "Nothing in your vault yet."
              : `${current} of ${items.length} confirmed in the last 12 months.`}
          </p>
        </div>
        <div className="panel sans">
          <h3>Legacy settings</h3>
          <p>
            {overdueChecks === 0
              ? "No legacy setting is overdue a re-check."
              : `${overdueChecks} legacy setting${overdueChecks === 1 ? " is" : "s are"} past the re-check date.`}
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href="/app/continuity">Open the Continuity Centre →</Link>
          </p>
        </div>
        <div className="panel sans">
          <h3>Paper copy</h3>
          <p>Once everything is current, print a copy for your fireproof box or your executor.</p>
          <p style={{ marginTop: 8 }}>
            <Link href="/app/print" prefetch={false}>Open the printable binder →</Link>
          </p>
        </div>
      </div>

      {items.length > 0 && due.length === 0 && (
        <div className="panel sans">
          <h3>Everything is current</h3>
          <p>
            Every item was confirmed or edited within the last year. We&rsquo;ll email you when
            something is due again.
          </p>
        </div>
      )}

      {due.length > 0 && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 22, marginBottom: 0 }}>
              {due.length} item{due.length === 1 ? "" : "s"} to look over
            </h2>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            {groups.map((g) => (
              <section key={g.key} className="panel sans" style={{ padding: "20px 22px" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ marginBottom: 0 }}>{g.title}</h3>
                  {g.items.length > 1 && (
                    <button
                      className="btn secondary small"
                      disabled={busy !== ""}
                      onClick={() =>
                        confirm(
                          g.items.map((i) => i.id),
                          `group:${g.key}`,
                          `Confirmed ${g.items.length} items in “${g.title}”.`
                        )
                      }
                    >
                      {busy === `group:${g.key}` ? "Saving…" : `All ${g.items.length} still correct`}
                    </button>
                  )}
                </div>
                <ul style={{ listStyle: "none", marginTop: 8 }}>
                  {g.items.map((i) => (
                    <li key={i.id} className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                      <div style={{ flex: "1 1 260px" }}>
                        <strong>{i.title}</strong>
                        <div className="muted" style={{ fontSize: 13.5 }}>
                          {[i.provider_name, i.location ? `kept: ${i.location}` : null, i.renewal_date ? `renews ${i.renewal_date}` : null]
                            .filter(Boolean)
                            .join(" · ") || "No details recorded"}
                          {" · "}last confirmed {agoPhrase(i.reviewed_at)}
                        </div>
                      </div>
                      <div className="row">
                        <button
                          className="btn small"
                          disabled={busy !== ""}
                          onClick={() => confirm([i.id], `item:${i.id}`, `Confirmed “${i.title}”.`)}
                        >
                          {busy === `item:${i.id}` ? "Saving…" : "Still correct"}
                        </button>
                        <Link href={`/app/inventory/${i.id}`} style={{ fontSize: 14.5 }}>
                          Change it
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
