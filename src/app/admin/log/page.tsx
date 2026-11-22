import { staffGate } from "@/lib/admin";
import { can } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  created_at: string;
};

export default async function AdminLog() {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  if (!can(ctx.role, "log.view")) return <AdminBlocked gate={{ status: "no_permission" }} />;

  const { data, error } = await ctx.service
    .from("staff_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Row[];

  return (
    <main>
      <AdminHeader ctx={ctx} title="Staff log" />
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 16 }}>
        The latest 300 things staff have done. Entries cannot be edited or deleted.
      </p>
      {error ? (
        <div className="error sans" role="alert">
          The staff log isn&rsquo;t set up in the database yet. Run the migration
          <code> 20261121000017_staff_roles.sql</code> in the Supabase SQL editor.
        </div>
      ) : rows.length === 0 ? (
        <p className="sans">Nothing recorded yet.</p>
      ) : (
        <div className="sans" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "8px 10px" }}>When</th>
                <th style={{ padding: "8px 10px" }}>Who</th>
                <th style={{ padding: "8px 10px" }}>Did</th>
                <th style={{ padding: "8px 10px" }}>To</th>
                <th style={{ padding: "8px 10px" }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  <td style={{ padding: "8px 10px" }}>
                    {r.actor_email ?? "—"}
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.actor_role}</div>
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.action}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {r.target_type === "account" && r.target_id ? (
                      <a href={`/admin/accounts?id=${r.target_id}`}>{r.target_label ?? r.target_id}</a>
                    ) : (
                      r.target_label ?? "—"
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
