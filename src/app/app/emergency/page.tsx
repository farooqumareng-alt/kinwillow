"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

type Request = {
  id: string;
  trusted_contact_id: string;
  request_class: string;
  reason: string | null;
  state: string;
  requested_at: string;
  release_at: string;
  held_at?: string | null;
  staff_cancelled_at?: string | null;
};
type Contact = { id: string; name: string };

const STATE_NAMES: Record<string, string> = {
  waiting: "Waiting period running",
  vetoed: "Vetoed by you",
  released: "Released",
  expired: "Expired",
  completed: "Completed",
};

export default function EmergencyPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [packageLinks, setPackageLinks] = useState<Record<string, string>>({});

  async function load(hid: string) {
    const supabase = createClient();
    const { data: rs } = await supabase
      .from("disclosure_requests")
      .select("*")
      .eq("household_id", hid)
      .order("requested_at", { ascending: false });
    setRequests((rs ?? []) as Request[]);
    const { data: cs } = await supabase
      .from("trusted_contacts")
      .select("id, name")
      .eq("household_id", hid)
      .neq("status", "removed");
    setContacts((cs ?? []) as Contact[]);
  }

  useEffect(() => {
    (async () => {
      const h = await getMyHousehold();
      setHousehold(h);
      if (h) {
        setDays(Math.round(h.waiting_period_hours / 24));
        await load(h.id);
      }
      setLoading(false);
    })();
  }, []);

  async function saveWaiting() {
    if (!household) return;
    const hours = Math.min(720, Math.max(48, days * 24));
    const supabase = createClient();
    const { error } = await supabase.from("households").update({ waiting_period_hours: hours }).eq("id", household.id);
    setMsg(error ? error.message : `Waiting period saved: ${Math.round(hours / 24)} days.`);
  }

  async function veto(r: Request) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMsg(null);
    const { data: vetoed, error } = await supabase
      .from("disclosure_requests")
      .update({ state: "vetoed", vetoed_by: user?.id, vetoed_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("state", "waiting")
      .select("id");
    if (error || !vetoed || vetoed.length === 0) {
      setMsg(
        error
          ? `The veto did not go through: ${error.message}`
          : "The veto did not go through — this request is no longer waiting. Refresh to see its current state."
      );
      if (household) await load(household.id);
      return;
    }
    setMsg("Request vetoed. Nothing will be released.");
    await supabase.rpc("append_audit", {
      p_household: household?.id,
      p_actor: user?.id,
      p_action: "disclosure.vetoed",
      p_entity: "disclosure_request",
      p_entity_id: r.id,
    });
    if (household) await load(household.id);
  }

  async function generate(r: Request) {
    setMsg(null);
    const res = await fetch("/api/disclosure/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: r.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error ?? "Could not generate the package.");
      return;
    }
    setPackageLinks((p) => ({ ...p, [r.id]: `${window.location.origin}/package/${json.access_token}` }));
    if (household) await load(household.id);
  }

  if (loading) return <main><p className="sans">Loading…</p></main>;
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? "Trusted contact";

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Emergency access
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24, maxWidth: 640 }}>
        When a trusted contact requests your recovery information, a waiting period starts. You are
        emailed straight away and reminded before the wait ends, and you can veto at any time. If
        the wait passes without a veto, the recovery package is released to that contact
        automatically — your vault items and documents, plus each account&rsquo;s legacy-setting
        instructions, limited to the scopes you gave them.
      </p>

      <div className="panel sans" style={{ marginBottom: 24, maxWidth: 560 }}>
        <h3>Waiting period</h3>
        <label>
          Days before a package is released (2–30)
          <input type="number" min={2} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 110 }} />
        </label>
        <button className="btn" style={{ marginTop: 10 }} onClick={saveWaiting} disabled={household?.role !== "owner"}>Save waiting period</button>
        {household?.role !== "owner" && <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>Only the owner can change this.</p>}
      </div>

      <h2 style={{ fontSize: 22, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Requests
      </h2>
      {requests.length === 0 ? (
        <p className="sans">No requests. When a trusted contact uses their request link, it will appear here.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {requests.map((r) => {
            const due = new Date(r.release_at).getTime() <= Date.now();
            return (
              <div key={r.id} className="panel sans">
                <strong>{contactName(r.trusted_contact_id)}</strong> · {r.request_class === "death" ? "reported a death" : "reported incapacity"} ·{" "}
                <span className={`chip ${r.state === "waiting" ? "warn" : r.state === "released" ? "good" : r.state === "vetoed" ? "bad" : ""}`}>
                  {r.staff_cancelled_at
                    ? "Cancelled by KinWillow after review"
                    : r.state === "waiting" && r.held_at
                      ? "Paused by KinWillow for review"
                      : STATE_NAMES[r.state] ?? r.state}
                </span>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  Requested {new Date(r.requested_at).toLocaleString()} · {r.state === "waiting" ? "Releases automatically after" : "Waiting period ended"}{" "}
                  {new Date(r.release_at).toLocaleString()}
                </div>
                {r.reason && <p style={{ marginTop: 6 }}>{r.reason}</p>}
                {r.state === "waiting" && household?.role !== "owner" && (
                  <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>Only the vault&rsquo;s owner can veto or release this request.</p>
                )}
                {r.state === "waiting" && household?.role === "owner" && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn danger" onClick={() => veto(r)}>Veto — stop this request</button>
                    <button className="btn secondary" onClick={() => generate(r)} disabled={!due}>
                      {due ? "Release the package now" : "Waiting period not over"}
                    </button>
                  </div>
                )}
                {packageLinks[r.id] && (
                  <p style={{ marginTop: 10 }}>
                    Released. The contact has been emailed this link (valid 30 days): <code>{packageLinks[r.id]}</code>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="sans" role="status" style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}
