import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/crypto";
import { HOUSEHOLD_COOKIE, MEMBERSHIP_SELECT, pickHousehold, type MembershipRow } from "@/lib/household-select";
import { SECTIONS } from "@/lib/sections";
import { effectiveState, STATE_LABELS, type VerifiedState } from "@/lib/continuity";
import { agoPhrase } from "@/lib/review";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// The printable binder: the whole vault on paper, for a fireproof box or an
// executor. It is the same information a trusted contact would receive, so a
// family is never dependent on this website existing.
type Item = {
  id: string;
  section: number | null;
  title: string;
  provider_name: string | null;
  account_type: string | null;
  last4: string | null;
  location: string | null;
  notes: string | null;
  renewal_date: string | null;
  reviewed_at?: string | null;
};
type Rec = {
  id: string;
  provider_id: string;
  account_ref: string | null;
  designated_recipient: string | null;
  verified_state: VerifiedState;
  recheck_due: string | null;
  recovery_path_enc: string | null;
  key_location_enc: string | null;
};

export default async function PrintPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: memberships } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: true });
  const preferred = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  const household = pickHousehold((memberships ?? []) as unknown as MembershipRow[], preferred)?.households;

  if (!household) {
    return (
      <main>
        <h1>Printable binder</h1>
        <p className="sans muted">Your vault could not be loaded. Please sign in again.</p>
      </main>
    );
  }
  const hid = household.id;

  const [items, records, providers, contacts, docs] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("household_id", hid).eq("archived", false).order("created_at"),
    supabase.from("continuity_records").select("*").eq("household_id", hid),
    supabase.from("provider_catalog").select("id, name, mechanism_type, recovery_summary"),
    supabase.from("trusted_contacts").select("name, email, relationship").eq("household_id", hid).neq("status", "removed").order("created_at"),
    supabase.from("documents").select("item_id, file_name").eq("household_id", hid),
  ]);
  const itemRows = (items.data ?? []) as Item[];
  const recRows = (records.data ?? []) as Rec[];
  const provById = new Map(
    ((providers.data ?? []) as Array<{ id: string; name: string; mechanism_type: string; recovery_summary: string }>).map((p) => [p.id, p])
  );
  const docsByItem = new Map<string, string[]>();
  for (const d of (docs.data ?? []) as Array<{ item_id: string | null; file_name: string }>) {
    if (d.item_id) docsByItem.set(d.item_id, [...(docsByItem.get(d.item_id) ?? []), d.file_name]);
  }
  const reveal = (enc: string | null) => {
    if (!enc) return null;
    try {
      return decryptField(hid, enc);
    } catch {
      return "(could not be decrypted — view it in the Continuity Centre)";
    }
  };

  // Recovery instructions appear on this page, so it is logged like an export.
  await supabase.rpc("append_audit", {
    p_household: hid,
    p_actor: user?.id ?? null,
    p_action: "household.printed",
    p_entity: "household",
    p_entity_id: hid,
  });

  const groups = [
    ...SECTIONS.map((s) => ({ title: `${s.n}. ${s.title}`, items: itemRows.filter((i) => i.section === s.n) })),
    { title: "Other items", items: itemRows.filter((i) => i.section == null) },
  ].filter((g) => g.items.length > 0);
  const today = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

  return (
    <main className="binder">
      <div className="row no-print" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <p className="sans muted" style={{ maxWidth: 520 }}>
          This is your whole vault on paper. Keep the printed copy somewhere safe, such as a
          fireproof box, and tell your trusted contact where it is.
        </p>
        <PrintButton />
      </div>

      <h1 style={{ marginBottom: 4 }}>{household.name}</h1>
      <p className="sans muted" style={{ marginBottom: 6 }}>
        Family continuity record · prepared {today} with KinWillow
      </p>
      <p className="sans" style={{ fontSize: 14, marginBottom: 22 }}>
        This record says where things are and how each provider&rsquo;s own recovery process works.
        It contains no passwords and gives no legal authority: to close or take over an account,
        use the provider&rsquo;s official process.
      </p>

      {contacts.data && contacts.data.length > 0 && (
        <section className="binder-section">
          <h2>Trusted contacts</h2>
          <ul className="sans">
            {(contacts.data as Array<{ name: string; email: string; relationship: string | null }>).map((c) => (
              <li key={c.email}>
                <strong>{c.name}</strong>
                {c.relationship ? ` (${c.relationship})` : ""} — {c.email}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length === 0 && recRows.length === 0 && (
        <p className="sans">
          Your vault is empty so far. <Link href="/app/setup">Start the guided setup</Link>.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.title} className="binder-section">
          <h2>{g.title}</h2>
          {g.items.map((i) => {
            const detail = [i.provider_name, i.account_type, i.last4 ? `ending ${i.last4}` : null].filter(Boolean).join(" · ");
            const files = docsByItem.get(i.id) ?? [];
            return (
              <div key={i.id} className="binder-item sans">
                <strong>{i.title}</strong>
                {detail && <span className="muted"> — {detail}</span>}
                {i.location && <div>Where it is: {i.location}</div>}
                {i.notes && <div style={{ whiteSpace: "pre-wrap" }}>{i.notes}</div>}
                {i.renewal_date && <div>Renews or expires: {i.renewal_date}</div>}
                {files.length > 0 && <div>Copies stored in KinWillow: {files.join(", ")}</div>}
                {i.reviewed_at && <div className="muted" style={{ fontSize: 12.5 }}>Last confirmed {agoPhrase(i.reviewed_at)}</div>}
              </div>
            );
          })}
        </section>
      ))}

      {recRows.length > 0 && (
        <section className="binder-section">
          <h2>Account legacy settings</h2>
          {recRows.map((r) => {
            const prov = provById.get(r.provider_id);
            const state = effectiveState(r);
            const path = reveal(r.recovery_path_enc);
            const key = reveal(r.key_location_enc);
            return (
              <div key={r.id} className="binder-item sans">
                <strong>{prov?.name ?? r.provider_id}</strong>
                {prov?.mechanism_type ? <span className="muted"> — {prov.mechanism_type}</span> : null}
                <div>Status: {STATE_LABELS[state] ?? state}</div>
                {r.account_ref && <div>Account: {r.account_ref}</div>}
                {r.designated_recipient && <div>Person named: {r.designated_recipient}</div>}
                {path && <div style={{ whiteSpace: "pre-wrap" }}>Recovery instructions: {path}</div>}
                {key && <div style={{ whiteSpace: "pre-wrap" }}>Where the access key is kept: {key}</div>}
                {prov?.recovery_summary && <div className="muted" style={{ fontSize: 13 }}>How it works: {prov.recovery_summary}</div>}
              </div>
            );
          })}
        </section>
      )}

      <p className="sans muted" style={{ fontSize: 12.5, marginTop: 28 }}>
        Printed {today}. Information may have changed since; the live vault is at kinwillow.com.
      </p>
    </main>
  );
}
