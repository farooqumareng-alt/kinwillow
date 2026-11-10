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

  const [profiles, households, signups, messages, disclosures, audit] = await Promise.all([
    service.from("profiles").select("user_id", { count: "exact", head: true }),
    service.from("households").select("plan_tier, status"),
    service.from("signups").select("id", { count: "exact", head: true }),
    service.from("messages").select("id, read_at"),
    service.from("disclosure_requests").select("state"),
    service.from("audit_log").select("household_id, prev_hash, entry_hash, created_at").order("created_at", { ascending: true }).limit(2000),
  ]);

  const hh = (households.data ?? []) as Array<{ plan_tier: string; status: string }>;
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
          <h3>Funnel</h3>
          <p><strong>{signups.count ?? 0}</strong> checklist signups</p>
          <p><strong>{unread}</strong> unread contact messages</p>
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
