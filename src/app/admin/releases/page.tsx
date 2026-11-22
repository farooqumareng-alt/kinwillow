import { staffGate } from "@/lib/admin";
import { can } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";
import StaffButtons, { type StaffButton } from "@/components/StaffButtons";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  household_id: string;
  trusted_contact_id: string;
  request_class: string;
  state: string;
  requested_at: string;
  release_at: string;
  owner_notified_at: string | null;
  held_at?: string | null;
  hold_reason?: string | null;
  staff_cancelled_at?: string | null;
};

const when = (v: string) => `${new Date(v).toISOString().slice(0, 16).replace("T", " ")} UTC`;
function timeLeft(iso: string): string {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
  if (hours <= 0) return "due now";
  return hours < 48 ? `in ${hours} hours` : `in ${Math.round(hours / 24)} days`;
}

export default async function AdminReleases() {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  if (!can(ctx.role, "releases.view")) return <AdminBlocked gate={{ status: "no_permission" }} />;
  const { service } = ctx;
  const canManage = can(ctx.role, "releases.manage");

  const [waitingRes, recentRes, pendingRes] = await Promise.all([
    service.from("disclosure_requests").select("*").eq("state", "waiting").order("release_at", { ascending: true }).limit(200),
    service.from("disclosure_requests").select("*").neq("state", "waiting").order("requested_at", { ascending: false }).limit(25),
    service.from("staff_approvals").select("target_id").eq("status", "pending").eq("action", "release_cancel"),
  ]);
  const waiting = (waitingRes.data ?? []) as RequestRow[];
  const recent = (recentRes.data ?? []) as RequestRow[];
  const cancelPending = new Set(((pendingRes.data ?? []) as Array<{ target_id: string }>).map((p) => p.target_id));

  // Names for display. A trusted contact's name and relationship are needed
  // to judge a request; nothing from inside the vault is read.
  const all = [...waiting, ...recent];
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [householdsRes, contactsRes, pastRes] = await Promise.all([
    service.from("households").select("id, name, owner_id").in("id", all.length ? all.map((r) => r.household_id) : none),
    service.from("trusted_contacts").select("id, name, relationship, created_at").in("id", all.length ? all.map((r) => r.trusted_contact_id) : none),
    service.from("disclosure_requests").select("trusted_contact_id").in("trusted_contact_id", waiting.length ? waiting.map((r) => r.trusted_contact_id) : none),
  ]);
  const households = new Map(((householdsRes.data ?? []) as Array<{ id: string; name: string; owner_id: string }>).map((h) => [h.id, h]));
  const contacts = new Map(
    ((contactsRes.data ?? []) as Array<{ id: string; name: string; relationship: string | null; created_at: string }>).map((c) => [c.id, c])
  );
  const requestCount = new Map<string, number>();
  for (const r of (pastRes.data ?? []) as Array<{ trusted_contact_id: string }>) {
    requestCount.set(r.trusted_contact_id, (requestCount.get(r.trusted_contact_id) ?? 0) + 1);
  }

  /** Things worth a second look. None of them proves anything on its own. */
  function flags(r: RequestRow): string[] {
    const out: string[] = [];
    const contact = contacts.get(r.trusted_contact_id);
    if (contact) {
      const days = (new Date(r.requested_at).getTime() - new Date(contact.created_at).getTime()) / 86_400_000;
      if (days < 14) out.push(`Contact was added only ${Math.max(0, Math.round(days))} days before asking`);
    }
    if ((requestCount.get(r.trusted_contact_id) ?? 0) > 1) out.push(`This contact has made ${requestCount.get(r.trusted_contact_id)} requests`);
    if (!r.owner_notified_at) out.push("The owner has not been reached by email yet (release waits until they are)");
    return out;
  }

  return (
    <main>
      <AdminHeader ctx={ctx} title="Emergency requests" />
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 20, maxWidth: 720 }}>
        Requests from trusted contacts that are in their waiting period, soonest release first. A
        hold pauses the automatic release while you look into it; the owner can still veto or
        release it themselves. Cancelling a request needs a second staff member.
      </p>

      <h2 className="sans" style={{ fontSize: 20, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 12 }}>
        Waiting ({waiting.length})
      </h2>
      <div className="sans" style={{ display: "grid", gap: 10, marginBottom: 32 }}>
        {waiting.length === 0 && <p>No requests are waiting.</p>}
        {waiting.map((r) => {
          const household = households.get(r.household_id);
          const contact = contacts.get(r.trusted_contact_id);
          const held = Boolean(r.held_at);
          const noted = flags(r);
          const buttons: StaffButton[] = [];
          if (canManage) {
            buttons.push(
              held
                ? { label: "Lift hold", what: `Lift the hold on the request for ${household?.name ?? "this household"}. It will release no sooner than 24 hours from now.`, payload: { action: "release_unhold", request_id: r.id } }
                : { label: "Put on hold", what: `Pause the automatic release for ${household?.name ?? "this household"} while you review it.`, payload: { action: "release_hold", request_id: r.id }, primary: true }
            );
            if (!cancelPending.has(r.id)) {
              buttons.push({
                label: "Ask to cancel",
                what: `Cancel the request on ${household?.name ?? "this household"} so nothing is released. A second staff member must approve.`,
                payload: { action: "release_cancel", request_id: r.id },
              });
            }
          }
          return (
            <div key={r.id} className="panel">
              <strong>{household?.name ?? "Household"}</strong> ·{" "}
              {r.request_class === "death" ? "a death was reported" : "incapacity was reported"} by{" "}
              {contact?.name ?? "a trusted contact"}
              {contact?.relationship ? ` (${contact.relationship})` : ""}
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                Asked {when(r.requested_at)} · Releases {when(r.release_at)} ({timeLeft(r.release_at)}) · Owner{" "}
                {r.owner_notified_at ? `told ${when(r.owner_notified_at)}` : "not yet told"}
                {household ? (
                  <>
                    {" · "}
                    <a href={`/admin/accounts?id=${household.owner_id}`}>Owner&rsquo;s account</a>
                  </>
                ) : null}
              </div>
              {held && (
                <div className="notice" style={{ marginTop: 10 }}>
                  On hold since {when(r.held_at!)}: {r.hold_reason}
                </div>
              )}
              {cancelPending.has(r.id) && (
                <div className="notice" style={{ marginTop: 10 }}>
                  A cancellation is waiting for a second person. <a href="/admin/approvals">See approvals</a>
                </div>
              )}
              {noted.length > 0 && (
                <ul style={{ paddingLeft: 18, marginTop: 10, fontSize: 14, color: "#7c2d20" }}>
                  {noted.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {buttons.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <StaffButtons buttons={buttons} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="sans" style={{ fontSize: 20, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 12 }}>
        Recently finished
      </h2>
      <div className="sans">
        {recent.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ padding: "2px 0" }}>
                {when(r.requested_at)} — {households.get(r.household_id)?.name ?? "Household"}:{" "}
                {r.staff_cancelled_at ? "cancelled by KinWillow" : r.state === "vetoed" ? "vetoed by the owner" : r.state}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
