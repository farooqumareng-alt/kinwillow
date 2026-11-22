import { staffGate } from "@/lib/admin";
import { can, NEEDS_SECOND_PERSON } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";
import StaffButtons from "@/components/StaffButtons";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  action: string;
  summary: string;
  reason: string;
  requested_by: string;
  requested_by_email: string | null;
  requested_at: string;
  expires_at: string;
  status: string;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const when = (v: string) => `${new Date(v).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default async function AdminApprovals() {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  // Anyone who can ask for, or decide, a two-person action.
  const mayDecide = (action: string) => {
    const permission = NEEDS_SECOND_PERSON[action];
    return Boolean(permission) && can(ctx.role, permission);
  };
  if (!Object.keys(NEEDS_SECOND_PERSON).some(mayDecide)) return <AdminBlocked gate={{ status: "no_permission" }} />;

  const { data, error } = await ctx.service.from("staff_approvals").select("*").order("requested_at", { ascending: false }).limit(100);
  const rows = ((data ?? []) as Row[]).filter((r) => mayDecide(r.action));
  const live = (r: Row) => r.status === "pending" && new Date(r.expires_at).getTime() > Date.now();
  const pending = rows.filter(live);
  const done = rows.filter((r) => !live(r));

  return (
    <main>
      <AdminHeader ctx={ctx} title="Approvals" />
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 20, maxWidth: 720 }}>
        Giving someone a staff role and cancelling an emergency request each take two people: one
        asks, a different one approves. Nothing changes until it is approved, and a request lapses
        after 7 days.
      </p>
      {error && (
        <div className="error sans" role="alert" style={{ marginBottom: 16 }}>
          Approvals aren&rsquo;t set up in the database yet. Run the migration
          <code> 20261121000018_release_queue_and_approvals.sql</code> in the Supabase SQL editor.
        </div>
      )}

      <h2 className="sans" style={{ fontSize: 20, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 12 }}>
        Waiting for a decision ({pending.length})
      </h2>
      <div className="sans" style={{ display: "grid", gap: 10, marginBottom: 32 }}>
        {pending.length === 0 && <p>Nothing is waiting.</p>}
        {pending.map((r) => {
          const mine = r.requested_by === ctx.user.id;
          return (
            <div key={r.id} className="panel">
              <strong>{r.summary}</strong>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                Asked by {mine ? "you" : r.requested_by_email} on {when(r.requested_at)} · lapses {when(r.expires_at)}
              </div>
              <p style={{ marginTop: 8 }}>Reason: &ldquo;{r.reason}&rdquo;</p>
              <div style={{ marginTop: 12 }}>
                {mine ? (
                  <>
                    <p style={{ marginBottom: 8 }}>You asked for this, so a different staff member has to decide it.</p>
                    <StaffButtons
                      buttons={[{ label: "Withdraw", what: `Withdraw your request: ${r.summary}.`, payload: { action: "approval_decide", id: r.id, decision: "withdraw" } }]}
                    />
                  </>
                ) : (
                  <StaffButtons
                    buttons={[
                      { label: "Approve", what: `Approve: ${r.summary}. It happens immediately.`, payload: { action: "approval_decide", id: r.id, decision: "approve" }, primary: true },
                      { label: "Reject", what: `Reject: ${r.summary}. Nothing will change.`, payload: { action: "approval_decide", id: r.id, decision: "reject" } },
                    ]}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="sans" style={{ fontSize: 20, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 12 }}>
        Decided
      </h2>
      <div className="sans">
        {done.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            {done.map((r) => (
              <li key={r.id} style={{ padding: "3px 0" }}>
                {when(r.requested_at)} — {r.summary}: <strong>{r.status === "pending" ? "lapsed" : r.status}</strong>
                {r.decided_by_email ? ` by ${r.decided_by_email}` : ""} (asked by {r.requested_by_email})
                {r.decision_note ? ` — “${r.decision_note}”` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
