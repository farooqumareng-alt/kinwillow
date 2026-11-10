"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold } from "@/lib/household";
import { SECTIONS, ESSENTIAL_SLOTS, ACCOUNT_TYPES, COMMON_INSTITUTIONS } from "@/lib/sections";

interface Draft {
  entry?: string;
  location?: string;
  institution?: string;
  type?: string;
  last4?: string;
}

export default function SetupWizardPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [slotDone, setSlotDone] = useState<Record<string, { location: string | null }>>({});
  const [skips, setSkips] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<string[]>([]);
  const [open, setOpen] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function load() {
    const supabase = createClient();
    const h = await getMyHousehold();
    if (!h) return;
    setHouseholdId(h.id);
    const { data } = await supabase
      .from("inventory_items")
      .select("section, slot_key, location")
      .eq("household_id", h.id)
      .eq("archived", false);
    const c: Record<number, number> = {};
    const slots: Record<string, { location: string | null }> = {};
    const locs: string[] = [];
    (data ?? []).forEach((r: { section: number | null; slot_key: string | null; location: string | null }) => {
      if (r.section) c[r.section] = (c[r.section] ?? 0) + 1;
      if (r.slot_key) slots[r.slot_key] = { location: r.location };
      if (r.location && !locs.includes(r.location)) locs.push(r.location);
    });
    setCounts(c);
    setSlotDone(slots);
    setLocations(locs.slice(0, 8));
    const { data: sk } = await supabase.from("wizard_skips").select("prompt_key").eq("household_id", h.id);
    setSkips(new Set((sk ?? []).map((r: { prompt_key: string }) => r.prompt_key)));
  }
  useEffect(() => {
    load();
  }, []);

  const doneSections = SECTIONS.filter((s) => (counts[s.n] ?? 0) > 0).length;
  const setDraft = (key: string, patch: Draft) =>
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? {}), ...patch } }));

  async function insertItem(payload: Record<string, unknown>, key: string) {
    if (!householdId) return false;
    setBusyKey(key);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").insert({ household_id: householdId, ...payload });
    if (error) {
      setError(error.message);
      setBusyKey("");
      return false;
    }
    setDrafts((d) => ({ ...d, [key]: {} }));
    await load();
    setBusyKey("");
    return true;
  }

  async function addSlot(slotKey: string, title: string, hint: string) {
    const key = `slot:${slotKey}`;
    const loc = (drafts[key]?.location ?? "").trim();
    await insertItem(
      { title, category: "document", section: 3, slot_key: slotKey, location: loc || null, notes: `Checklist prompt: ${hint}` },
      key
    );
  }

  async function quickAdd(section: number, prompt: string, category: string) {
    const key = `${section}:${prompt}`;
    const d = drafts[key] ?? {};
    if (section === 4) {
      const institution = (d.institution ?? "").trim();
      if (!institution) return;
      const title = [institution, d.type].filter(Boolean).join(" — ");
      await insertItem(
        {
          title,
          category,
          section,
          provider_name: institution,
          account_type: d.type || null,
          last4: (d.last4 ?? "").replace(/\D/g, "").slice(0, 4) || null,
          location: (d.location ?? "").trim() || null,
          notes: `Checklist prompt: ${prompt}`,
        },
        key
      );
      return;
    }
    const title = (d.entry ?? "").trim();
    if (!title) return;
    await insertItem(
      { title, category, section, location: (d.location ?? "").trim() || null, notes: `Checklist prompt: ${prompt}` },
      key
    );
  }

  async function skip(promptKey: string) {
    if (!householdId) return;
    const supabase = createClient();
    await supabase.from("wizard_skips").insert({ household_id: householdId, prompt_key: promptKey });
    await load();
  }
  async function unskip(promptKey: string) {
    if (!householdId) return;
    const supabase = createClient();
    await supabase.from("wizard_skips").delete().eq("household_id", householdId).eq("prompt_key", promptKey);
    await load();
  }

  const locationField = (key: string, placeholder = "Where is it stored?") => (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
      <input
        type="text"
        list="kw-locations"
        placeholder={placeholder}
        value={drafts[key]?.location ?? ""}
        onChange={(e) => setDraft(key, { location: e.target.value })}
        style={{ width: "100%" }}
      />
      {locations.length > 0 && (
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {locations.slice(0, 5).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setDraft(key, { location: l })}
              style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, border: "1px solid var(--line)", background: "#faf7f0", cursor: "pointer" }}
            >
              {l}
            </button>
          ))}
        </span>
      )}
    </span>
  );

  const skipBtn = (promptKey: string) => (
    <button
      type="button"
      onClick={() => skip(promptKey)}
      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, textDecoration: "underline", whiteSpace: "nowrap" }}
    >
      Don&rsquo;t have one
    </button>
  );

  return (
    <main>
      <datalist id="kw-locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <datalist id="kw-institutions">
        {COMMON_INSTITUTIONS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>

      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Guided setup
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 8, maxWidth: 640 }}>
        The Family Continuity Checklist, turned into a walk-through. Most answers are one tap: places
        you&rsquo;ve used before become buttons, and anything you don&rsquo;t have can be skipped.
        Write where things live and how recovery works; <strong>never write a password</strong>.
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
              {isOpen && s.n === 3 && (
                <div className="sans" style={{ marginTop: 12 }}>
                  <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 12 }}>
                    The essentials, ready-made. For each one: say where the original lives (type it once —
                    it becomes a one-tap button everywhere), or tap &ldquo;Don&rsquo;t have one.&rdquo; You
                    can attach a scanned copy later from the item&rsquo;s page.
                  </p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {ESSENTIAL_SLOTS.map((slot) => {
                      const key = `slot:${slot.key}`;
                      const done = slotDone[slot.key];
                      const isSkipped = skips.has(key);
                      if (done) {
                        return (
                          <div key={key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ flex: "1 1 300px", fontSize: 14 }}>✓ <strong>{slot.title}</strong>
                              <span style={{ color: "var(--muted)" }}>{done.location ? ` — ${done.location}` : ""}</span>
                            </span>
                            <Link href="/app/inventory" style={{ fontSize: 13 }}>View in vault</Link>
                          </div>
                        );
                      }
                      if (isSkipped) {
                        return (
                          <div key={key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: "var(--muted)" }}>
                            <span style={{ flex: "1 1 300px", fontSize: 14 }}>{slot.title} — skipped</span>
                            <button type="button" onClick={() => unskip(key)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Undo</button>
                          </div>
                        );
                      }
                      return (
                        <div key={key} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <span style={{ flex: "1 1 240px", fontSize: 14, color: "#38443c" }}>
                            <strong>{slot.title}</strong>
                            <br />
                            <span style={{ color: "var(--muted)", fontSize: 13 }}>{slot.hint}</span>
                          </span>
                          {locationField(key)}
                          <button className="btn" style={{ padding: "10px 18px" }} disabled={busyKey === key} onClick={() => addSlot(slot.key, slot.title, slot.hint)}>
                            {busyKey === key ? "Adding…" : "Add"}
                          </button>
                          {skipBtn(key)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {isOpen && s.n !== 3 && (
                <div className="sans" style={{ marginTop: 12 }}>
                  {s.intro && <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 12 }}>{s.intro}</p>}
                  <div style={{ display: "grid", gap: 12 }}>
                    {s.prompts.map((prompt) => {
                      const key = `${s.n}:${prompt}`;
                      if (skips.has(key)) {
                        return (
                          <div key={key} style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--muted)", fontSize: 14 }}>
                            <span style={{ flex: 1 }}>{prompt} — skipped</span>
                            <button type="button" onClick={() => unskip(key)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Undo</button>
                          </div>
                        );
                      }
                      if (s.n === 4) {
                        const d = drafts[key] ?? {};
                        return (
                          <div key={key} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <span style={{ flex: "1 1 220px", fontSize: 14, color: "#38443c" }}>{prompt}</span>
                            <input type="text" list="kw-institutions" placeholder="Institution (start typing…)" value={d.institution ?? ""} onChange={(e) => setDraft(key, { institution: e.target.value })} style={{ flex: "1 1 160px" }} />
                            <select value={d.type ?? ""} onChange={(e) => setDraft(key, { type: e.target.value })} style={{ flex: "0 1 150px" }}>
                              <option value="">Account type…</option>
                              {ACCOUNT_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <input type="text" inputMode="numeric" maxLength={4} placeholder="Last 4" value={d.last4 ?? ""} onChange={(e) => setDraft(key, { last4: e.target.value.replace(/\D/g, "") })} style={{ flex: "0 1 80px" }} />
                            <button className="btn" style={{ padding: "10px 18px" }} disabled={busyKey === key || !(d.institution ?? "").trim()} onClick={() => quickAdd(s.n, prompt, s.category)}>
                              {busyKey === key ? "Adding…" : "Add"}
                            </button>
                            {skipBtn(key)}
                          </div>
                        );
                      }
                      return (
                        <div key={key} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <span style={{ flex: "1 1 280px", fontSize: 14, color: "#38443c" }}>{prompt}</span>
                          <input
                            type="text"
                            placeholder="Your entry (e.g. a name, place, or provider)"
                            value={drafts[key]?.entry ?? ""}
                            onChange={(e) => setDraft(key, { entry: e.target.value })}
                            style={{ flex: "1 1 220px" }}
                          />
                          {locationField(key, "Where is it stored? (optional)")}
                          <button className="btn" style={{ padding: "10px 18px" }} disabled={busyKey === key} onClick={() => quickAdd(s.n, prompt, s.category)}>
                            {busyKey === key ? "Adding…" : "Add"}
                          </button>
                          {skipBtn(key)}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
                    Entries land in <Link href="/app/inventory">Your vault</Link>, where you can add
                    notes, dates, and documents.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
