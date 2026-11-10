"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold } from "@/lib/household";
import { SECTIONS } from "@/lib/sections";

export default function SetupWizardPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [open, setOpen] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function load() {
    const supabase = createClient();
    const h = await getMyHousehold();
    if (!h) return;
    setHouseholdId(h.id);
    const { data } = await supabase
      .from("inventory_items")
      .select("section")
      .eq("household_id", h.id)
      .eq("archived", false)
      .not("section", "is", null);
    const c: Record<number, number> = {};
    (data ?? []).forEach((r: { section: number }) => {
      c[r.section] = (c[r.section] ?? 0) + 1;
    });
    setCounts(c);
  }
  useEffect(() => {
    load();
  }, []);

  const doneSections = SECTIONS.filter((s) => (counts[s.n] ?? 0) > 0).length;

  async function quickAdd(section: number, prompt: string, category: string) {
    const key = `${section}:${prompt}`;
    const title = (drafts[key] ?? "").trim();
    if (!title || !householdId) return;
    setBusyKey(key);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").insert({
      household_id: householdId,
      title,
      category,
      section,
      notes: `Checklist prompt: ${prompt}`,
    });
    if (error) setError(error.message);
    else {
      setDrafts((d) => ({ ...d, [key]: "" }));
      await load();
    }
    setBusyKey("");
  }

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Guided setup
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 8, maxWidth: 640 }}>
        The Family Continuity Checklist, turned into a walk-through. Ten sections, about an hour, at
        your pace — everything saves as you go. Write where things live and how recovery works;{" "}
        <strong>never write a password</strong>.
      </p>
      <p className="sans" style={{ marginBottom: 24 }}>
        Progress: <strong>{doneSections} of 10 sections started</strong>
        {doneSections === 10 ? " — vault built. You can refine everything in Your vault." : ""}
      </p>
      {error && <div className="error sans" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "grid", gap: 14 }}>
        {SECTIONS.map((s) => {
          const isOpen = open === s.n;
          const count = counts[s.n] ?? 0;
          return (
            <div key={s.n} className="panel">
              <button
                onClick={() => setOpen(isOpen ? 0 : s.n)}
                className="sans"
                style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer", padding: 0 }}
              >
                <h3 style={{ fontSize: 19 }}>
                  {count > 0 ? "✓ " : ""}Section {s.n}: {s.title}
                  <span style={{ float: "right", color: "var(--muted)", fontSize: 14 }}>
                    {count > 0 ? `${count} item${count === 1 ? "" : "s"} · ` : ""}{isOpen ? "▾" : "▸"}
                  </span>
                </h3>
              </button>
              {isOpen && (
                <div className="sans" style={{ marginTop: 12 }}>
                  {s.intro && <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 12 }}>{s.intro}</p>}
                  <div style={{ display: "grid", gap: 10 }}>
                    {s.prompts.map((prompt) => {
                      const key = `${s.n}:${prompt}`;
                      return (
                        <div key={key} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ flex: "1 1 300px", fontSize: 14, color: "#38443c" }}>{prompt}</span>
                          <input
                            type="text"
                            placeholder="Your entry (e.g. a name, place, or provider)"
                            value={drafts[key] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            style={{ flex: "1 1 260px" }}
                          />
                          <button className="btn" style={{ padding: "10px 18px" }} disabled={busyKey === key} onClick={() => quickAdd(s.n, prompt, s.category)}>
                            {busyKey === key ? "Adding…" : "Add"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
                    Entries land in <Link href="/app/inventory">Your vault</Link>, where you can add
                    notes, dates, and documents. You can also add items that don&rsquo;t match a prompt from the vault page.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {doneSections === 10 && (
        <div className="notice sans" style={{ marginTop: 22 }}>
          <strong>You just did the hardest part.</strong> Next, in Stage 2d, the Continuity Centre
          will walk you through switching on Apple, Google, and Meta legacy settings — and verifying
          each one. <Link href="/app/inventory">Review your vault →</Link>
        </div>
      )}
    </main>
  );
}
