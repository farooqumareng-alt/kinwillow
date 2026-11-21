import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}

export default async function AdminOverview() {
  const ctx = await requireAdmin();
  if (!ctx) {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>Not available</h1>
        <p className="sans">This page is not available.</p>
      </main>
    );
  }
  const { service } = ctx;

  const [profiles, households, signups, messages, disclosures, audit, itemRows, contactRows] = await Promise.all([
    service.from("profiles").select("user_id", { count: "exact", head: true }),
    service.from("households").select("id, plan_tier, status, kind"),
    service.from("signups").select("id", { count: "exact", head: true }),
    service.from("messages").select("id, read_at"),
    service.from("disclosure_requests").select("state"),
    service.from("audit_log").select("household_id, prev_hash, entry_hash, created_at").order("created_at", { ascending: true }).limit(2000),
    // Household ids only — counts, never contents.
    service.from("inventory_items").select("household_id").eq("archived", false).limit(50000),
    service.from("trusted_contacts").select("household_id, status, invited_at").neq("status", "removed").limit(50000),
  ]);

  const hh = (households.data ?? []) as Array<{ id: string; plan_tier: string; status: string; kind: string }>;

  // Activation funnel, computed from what already exists (no tracking):
  // checklist signup → account → first item → ten items → contact named →
  // contact told → paid. Parents' vaults are left out so each customer counts once.
  const ownIds = new Set(hh.filter((h) => h.kind !== "parents").map((h) => h.id));
  const itemCounts = countBy(
    ((itemRows.data ?? []) as Array<{ household_id: string }>).filter((r) => ownIds.has(r.household_id)),
    (r) => r.household_id
  );
  const contactList = ((contactRows.data ?? []) as Array<{ household_id: string; status: string; invited_at: string | null }>).filter(
    (c) => ownIds.has(c.household_id)
  );
  const accounts = ownIds.size;
  const funnel: Array<[string, number]> = [
    ["Checklist signups", signups.count ?? 0],
    ["Accounts created", accounts],
    ["Added a first item", Object.keys(itemCounts).length],
    ["Reached 10 items", Object.values(itemCounts).filter((n) => n >= 10).length],
    ["Named a trusted contact", new Set(contactList.map((c) => c.household_id)).size],
    ["Contact has their link", new Set(contactList.filter((c) => c.status === "accepted" || c.invited_at).map((c) => c.household_id)).size],
    ["On a paid plan", hh.filter((h) => h.kind !== "parents" && h.plan_tier !== "free").length],
  ];
  const pct = (n: number) => (accounts > 0 ? ` (${Math.round((n / accounts) * 100)}% of accounts)` : "");
  const byTier = countBy(hh, (h) => h.plan_tier);
  const byStatus = countBy(hh, (h) => h.status);
  const unread = ((messages.data ?? []) as Array<{ read_at: string | null }>).filter((m) => !m.read_at).length;
  const discByState = countBy((disclosures.data ?? []) as Array<{ state: string }>, (d) => d.state);

  // Hash-chain linkage verification: each entry's prev_hash must equal the
  // previous entry's entry_hash within the same household chain.
  const chains = new Map<string, { prev: string | null; ok: boolean; n: number }>();
  for (const e of (audit.data ?? []) as Array<{ household_id: string | null; prev_hash: string | null; entry_hash: string }>) {
    const k = e.household_id ?? "platform";
    const c = chains.get(k) ?? { prev: null, ok: true, n: 0 };
    if (c.n > 0 && e.prev_hash !== c.prev) c.ok = false;
    c.prev = e.entry_hash;
    c.n++;
    chains.set(k, c);
  }
  const chainList = Array.from(chains.entries());

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        KinWillow Admin
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        Metadata only — vault contents are never shown here. Signed in as {ctx.email}.
      </p>
      <nav className="app-nav sans" style={{ marginBottom: 24 }}>
        <a href="/admin">Overview</a>
        <a href="/admin/households">Users & households</a>
        <a href="/admin/inbox">Inbox</a>
      </nav>

      <div className="grid">
        <div className="panel sans">
          <h3>Users</h3>
          <p><strong>{profiles.count ?? 0}</strong> accounts</p>
          <p><strong>{hh.length}</strong> households</p>
          <p>By plan: {Object.entries(byTier).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</p>
          <p>By status: {Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</p>
        </div>
        <div className="panel sans">
          <h3>Activation funnel</h3>
          <ol style={{ paddingLeft: 20, fontSize: 15 }}>
            {funnel.map(([label, n], i) => (
              <li key={label} style={{ padding: "2px 0" }}>
                {label}: <strong>{n}</strong>
                {i >= 2 ? pct(n) : ""}
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 8 }}><strong>{unread}</strong> unread contact messages</p>
        </div>
        <div className="panel sans">
          <h3>Disclosure requests</h3>
          <p>{Object.entries(discByState).map(([k, v]) => `${k}: ${v}`).join(" · ") || "None yet"}</p>
        </div>
        <div className="panel sans">
          <h3>Audit chain integrity</h3>
          {chainList.length === 0 ? (
            <p>No audit entries yet.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {chainList.map(([k, c]) => (
                <li key={k}>
                  {k === "platform" ? "Platform" : `Household ${k.slice(0, 8)}…`}: {c.n} entries —{" "}
                  {c.ok ? "chain intact ✓" : "CHAIN BROKEN ⚠"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
