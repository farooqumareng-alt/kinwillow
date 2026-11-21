"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type InventoryItem } from "@/lib/household";
import { CATEGORY_LABELS, ACCOUNT_TYPES, COMMON_INSTITUTIONS, type Category } from "@/lib/sections";
import { friendlyError, isPlanLimit } from "@/lib/errors";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export default function InventoryPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ title: "", category: "account" as Category, provider_name: "", location: "", account_type: "", last4: "", criticality: "medium", renewal_date: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const h = await getMyHousehold();
    if (!h) return;
    setHouseholdId(h.id);
    setPlan(h.plan_tier);
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("household_id", h.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as InventoryItem[]);
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  const active = items.filter((i) => !i.archived);
  const visible = items.filter(
    (i) => (showArchived ? i.archived : !i.archived) && (filter === "all" || i.category === filter)
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId) return;
    setBusy(true);
    setError("");
    setUpgrade(false);
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").insert({
      household_id: householdId,
      title: form.title.trim(),
      category: form.category,
      provider_name: form.provider_name.trim() || null,
      location: form.location.trim() || null,
      account_type: form.category === "account" ? form.account_type || null : null,
      last4: form.category === "account" ? form.last4.replace(/\D/g, "").slice(0, 4) || null : null,
      criticality: form.criticality,
      renewal_date: form.renewal_date || null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      setError(friendlyError(error.message));
      setUpgrade(isPlanLimit(error.message));
    } else {
      setForm({ title: "", category: "account", provider_name: "", location: "", account_type: "", last4: "", criticality: "medium", renewal_date: "", notes: "" });
      await load();
    }
    setBusy(false);
  }

  async function toggleArchive(item: InventoryItem) {
    const supabase = createClient();
    setError("");
    setUpgrade(false);
    const { error } = await supabase.from("inventory_items").update({ archived: !item.archived }).eq("id", item.id);
    if (error) {
      setError(friendlyError(error.message));
      setUpgrade(isPlanLimit(error.message));
    }
    await load();
  }

  return (
    <main>
      <datalist id="kw-institutions">{COMMON_INSTITUTIONS.map((i) => (<option key={i} value={i} />))}</datalist>
      <datalist id="kw-locations">{Array.from(new Set(items.map((i) => i.location).filter(Boolean))).map((l) => (<option key={l as string} value={l as string} />))}</datalist>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Your vault
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        {active.length} active item{active.length === 1 ? "" : "s"}
        {plan === "free" ? ` of 25 on the Free plan` : ""} ·{" "}
        <Link href="/app/setup">Open the guided setup</Link> to build it section by section.
      </p>

      <div className="panel sans" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 12 }}>Add an item</h3>
        <form onSubmit={add} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <input type="text" placeholder="Title (e.g. Chase checking)" aria-label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <select aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <input type="text" list="kw-institutions" placeholder="Provider / institution" aria-label="Provider or institution" value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} />
          <input type="text" list="kw-locations" placeholder="Where is it stored?" aria-label="Where is it stored?" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          {form.category === "account" && (<>
            <select aria-label="Account type" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              <option value="">Account type…</option>
              {ACCOUNT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <input type="text" inputMode="numeric" maxLength={4} placeholder="Last 4 digits" aria-label="Last 4 digits" value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, "") })} />
          </>)}
          <select aria-label="Importance" value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>
            <option value="high">High importance</option>
            <option value="medium">Medium importance</option>
            <option value="low">Low importance</option>
          </select>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>
            Renewal / expiry date
            <input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} style={{ width: "100%" }} />
          </label>
          <input type="text" placeholder="Notes (where it lives, how recovery works — never a password)" aria-label="Notes — never a password" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit" disabled={busy}>{busy ? "Adding…" : "Add item"}</button>
        </form>
        {error && (
          <div className="error" role="alert">
            {error} {upgrade && <Link href="/app/billing">See plans</Link>}
          </div>
        )}
      </div>

      <div className="sans" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button className={`btn btn-secondary small${filter === "all" ? " is-active" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`btn btn-secondary small${filter === c ? " is-active" : ""}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_LABELS[c]}s
          </button>
        ))}
        <button className={`btn btn-secondary small${showArchived ? " is-active" : ""}`} aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
          Archived
        </button>
      </div>

      {!loaded && <p className="sans muted" role="status">Loading your vault…</p>}
      {loaded && visible.length === 0 && (
        <div className="panel">
          {items.length === 0 ? (
            <>
              <h3>Nothing here yet</h3>
              <p>Add your first item above, or use the <Link href="/app/setup">guided setup</Link> — it walks the 10 checklist sections in about an hour.</p>
            </>
          ) : (
            <>
              <h3>Nothing matches this filter</h3>
              <p>{showArchived ? "You have no archived items in this category." : "You have no items in this category yet."}</p>
            </>
          )}
        </div>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        {visible.map((item) => (
          <div key={item.id} className="panel sans" style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: "16px 22px", flexWrap: "wrap" }}>
            <div>
              <Link href={`/app/inventory/${item.id}`} style={{ fontSize: 17, color: "var(--green-dark)" }}>
                {item.title}
              </Link>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {CATEGORY_LABELS[item.category as Category] ?? item.category}
                {item.provider_name ? ` · ${item.provider_name}` : ""}
                {item.account_type ? ` · ${item.account_type}` : ""}
                {item.last4 ? ` · ····${item.last4}` : ""}
                {item.location ? ` · kept: ${item.location}` : ""}
                
                {item.renewal_date ? ` · renews ${item.renewal_date}` : ""}
                {item.criticality === "high" ? " · high importance" : ""}
              </div>
            </div>
            <button onClick={() => toggleArchive(item)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
              {item.archived ? "Restore" : "Archive"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
