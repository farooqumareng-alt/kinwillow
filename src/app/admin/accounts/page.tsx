import { auditForCustomer, logStaffAction, staffGate, type StaffContext } from "@/lib/admin";
import { can } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";
import AccountTools from "@/components/AccountTools";

export const dynamic = "force-dynamic";

type Profile = {
  user_id: string;
  email: string | null;
  display_name?: string | null;
  is_partner?: boolean;
  partner_code?: string | null;
  staff_role?: string | null;
  deletion_requested_at?: string | null;
  created_at?: string;
};

const when = (v: string | null | undefined) => (v ? `${new Date(v).toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  if (!can(ctx.role, "accounts.view")) return <AdminBlocked gate={{ status: "no_permission" }} />;

  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const id = UUID.test(params.id ?? "") ? params.id! : "";

  let results: Profile[] = [];
  if (q && !id) {
    // Escape the wildcard characters so the search is a plain "contains".
    const term = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await ctx.service.from("profiles").select("*").ilike("email", `%${term}%`).limit(25);
    results = (data ?? []) as Profile[];
  }

  return (
    <main>
      <AdminHeader ctx={ctx} title="Account lookup" />
      <form method="get" className="sans" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <input name="q" type="search" aria-label="Email" defaultValue={q} placeholder="Customer's email, or part of it" style={{ maxWidth: 420, flex: "1 1 260px" }} />
        <button className="btn" type="submit">Search</button>
      </form>

      {id ? (
        <AccountDetail ctx={ctx} id={id} />
      ) : q ? (
        <div className="sans" style={{ display: "grid", gap: 10 }}>
          {results.map((p) => (
            <a key={p.user_id} href={`/admin/accounts?id=${p.user_id}`} className="panel" style={{ textDecoration: "none", color: "inherit" }}>
              <strong>{p.email}</strong>
              {p.display_name ? ` · ${p.display_name}` : ""}
            </a>
          ))}
          {results.length === 0 && <p>No account has an email containing &ldquo;{q}&rdquo;.</p>}
        </div>
      ) : (
        <p className="sans" style={{ color: "var(--muted)" }}>
          Search by email to see an account&rsquo;s plan, status and history. Opening an account is
          recorded in the staff log.
        </p>
      )}
    </main>
  );
}

async function AccountDetail({ ctx, id }: { ctx: StaffContext; id: string }) {
  const { service } = ctx;
  const { data: profileRow } = await service.from("profiles").select("*").eq("user_id", id).maybeSingle();
  const profile = profileRow as Profile | null;
  if (!profile) return <p className="sans">That account no longer exists.</p>;

  // Looking at a customer's account is itself recorded — in the staff log and
  // in the customer's own activity log. Reloading the page within half an
  // hour counts as the same look.
  const { data: recentView } = await service
    .from("staff_actions")
    .select("id")
    .eq("action", "account.viewed")
    .eq("target_id", id)
    .eq("actor_id", ctx.user.id)
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(1);
  if (!recentView || recentView.length === 0) {
    await logStaffAction(ctx, { action: "account.viewed", targetType: "account", targetId: id, targetLabel: profile.email });
    if (id !== ctx.user.id) await auditForCustomer(ctx, id, "account_viewed");
  }

  const [authUser, owned, memberships, staffLog] = await Promise.all([
    service.auth.admin.getUserById(id),
    service.from("households").select("*").eq("owner_id", id),
    service.from("household_members").select("household_id, role").eq("user_id", id),
    service.from("staff_actions").select("*").eq("target_type", "account").eq("target_id", id).neq("action", "account.viewed").order("created_at", { ascending: false }).limit(20),
  ]);
  const u = authUser.data?.user ?? null;
  const households = (owned.data ?? []) as Array<{ id: string; name: string; plan_tier: string; status: string; kind?: string; created_at: string }>;
  const householdIds = households.map((h) => h.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const ids = householdIds.length ? householdIds : none;

  // Counts and event names only — never what an item or document contains.
  const [items, contacts, requests, audit] = await Promise.all([
    service.from("inventory_items").select("household_id").in("household_id", ids).eq("archived", false).limit(5000),
    service.from("trusted_contacts").select("household_id, status").in("household_id", ids).neq("status", "removed").limit(1000),
    service.from("disclosure_requests").select("household_id, state, created_at").in("household_id", ids).order("created_at", { ascending: false }).limit(20),
    service.from("audit_log").select("action, created_at").in("household_id", ids).order("created_at", { ascending: false }).limit(25),
  ]);
  const count = (rows: Array<{ household_id: string }> | null, hid: string) => (rows ?? []).filter((r) => r.household_id === hid).length;
  const helperOf = ((memberships.data ?? []) as Array<{ household_id: string; role: string }>).filter((m) => !householdIds.includes(m.household_id)).length;
  const confirmed = Boolean(u?.email_confirmed_at);

  return (
    <div className="sans" style={{ display: "grid", gap: 20 }}>
      <div className="panel">
        <h3>{profile.email}</h3>
        <p>
          {profile.display_name ? `${profile.display_name} · ` : ""}
          Signed up {when(u?.created_at ?? profile.created_at)} · Email {confirmed ? `confirmed ${when(u?.email_confirmed_at)}` : "NOT confirmed"} ·
          Last sign-in {when(u?.last_sign_in_at)}
        </p>
        <p>
          Authenticator app: {(u?.factors ?? []).some((f) => f.status === "verified") ? "on" : "off"}
          {profile.is_partner ? ` · Partner (code ${profile.partner_code})` : ""}
          {profile.staff_role ? ` · Staff (${profile.staff_role})` : ""}
          {helperOf > 0 ? ` · Helper in ${helperOf} other household${helperOf === 1 ? "" : "s"}` : ""}
        </p>
        {profile.deletion_requested_at && (
          <div className="error">Account deletion was requested on {when(profile.deletion_requested_at)}.</div>
        )}
        {can(ctx.role, "accounts.support") && profile.email && (
          <div style={{ marginTop: 16 }}>
            <AccountTools userId={id} email={profile.email} confirmed={confirmed} />
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Households</h3>
        {households.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 15 }}>
            {households.map((h) => (
              <li key={h.id} style={{ padding: "3px 0" }}>
                <strong>{h.name}</strong>
                {h.kind === "parents" ? " (parents' vault)" : ""} — plan {h.plan_tier}, {h.status} ·{" "}
                {count(items.data as Array<{ household_id: string }> | null, h.id)} items ·{" "}
                {count(contacts.data as Array<{ household_id: string }> | null, h.id)} trusted contacts
              </li>
            ))}
          </ul>
        )}
        {(can(ctx.role, "billing.manage") || can(ctx.role, "partners.manage")) && (
          <p style={{ marginTop: 8 }}>
            <a href="/admin/households">Change a plan, status or partner setting</a>
          </p>
        )}
      </div>

      <div className="panel">
        <h3>Emergency requests</h3>
        {((requests.data ?? []) as Array<{ state: string; created_at: string }>).length === 0 ? (
          <p>None.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 15 }}>
            {((requests.data ?? []) as Array<{ state: string; created_at: string }>).map((r, i) => (
              <li key={i}>{when(r.created_at)} — {r.state}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>Recent activity in their vault</h3>
        <p style={{ marginBottom: 8 }}>Event names only.</p>
        {((audit.data ?? []) as Array<{ action: string; created_at: string }>).length === 0 ? (
          <p>Nothing yet.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            {((audit.data ?? []) as Array<{ action: string; created_at: string }>).map((a, i) => (
              <li key={i}>{when(a.created_at)} — {a.action}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>What staff have done on this account</h3>
        {((staffLog.data ?? []) as Array<{ id: string; action: string; actor_email: string | null; reason: string | null; created_at: string }>).length === 0 ? (
          <p>Nothing.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            {((staffLog.data ?? []) as Array<{ id: string; action: string; actor_email: string | null; reason: string | null; created_at: string }>).map((s) => (
              <li key={s.id}>
                {when(s.created_at)} — {s.action} by {s.actor_email}
                {s.reason ? ` (“${s.reason}”)` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
