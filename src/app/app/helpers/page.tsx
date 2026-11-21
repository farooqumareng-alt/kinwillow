"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

type Helper = { user_id: string; email: string; grant_level: string; created_at: string };
type Invite = { id: string; email: string; grant_level: string; expires_at: string };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const grantText = (g: string) => (g === "edit" ? "Can add and change things" : "Can look only");

export default function HelpersPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [max, setMax] = useState(5);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [grant, setGrant] = useState("edit");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load(h: HouseholdInfo) {
    if (h.role !== "owner") return;
    const res = await fetch(`/api/helpers?household_id=${h.id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "The list of helpers could not be loaded.");
      return;
    }
    setHelpers(json.helpers ?? []);
    setInvites(json.invites ?? []);
    setMax(json.max ?? 5);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      setMe(user?.id ?? null);
      const h = await getMyHousehold();
      setHousehold(h);
      if (h) await load(h);
      setLoading(false);
    })();
  }, []);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>, key: string, done: string) {
    if (!household) return false;
    setBusy(key);
    setMsg("");
    setError("");
    setConfirm(null);
    const res = await fetch("/api/helpers", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_id: household.id, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(json.error ?? "That didn't work. Please try again.");
      return false;
    }
    setMsg(done);
    await load(household);
    return true;
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { email, grant }, "invite", `Invitation sent to ${email.trim()}.`)) setEmail("");
  }

  async function leave() {
    if (!household || !me) return;
    if (await call("DELETE", { user_id: me }, "leave", "")) {
      // The vault is no longer yours to see: go back to your own.
      document.cookie = "kw_household=; path=/; max-age=0";
      window.location.assign("/app");
    }
  }

  if (loading) return <main><p className="sans muted" role="status">Loading…</p></main>;
  if (!household) return <main><p className="sans">Your vault could not be loaded.</p></main>;

  // A helper looking at a client's vault.
  if (household.role !== "owner") {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Helpers</h1>
        <div className="panel sans" style={{ maxWidth: 620, marginTop: 18 }}>
          <h3>You are helping with {household.name}</h3>
          <p>
            The owner invited you. You {household.grant_level === "edit" ? "can add and correct things" : "can look, but not change anything"}.
            Only the owner can invite others, change billing, or decide when anything is released to
            their family.
          </p>
          {error && <div className="error" role="alert">{error}</div>}
          {confirm === "leave" ? (
            <div className="row" style={{ marginTop: 14 }}>
              <span>Stop helping with this vault? You will lose access straight away.</span>
              <button className="btn danger small" onClick={leave} disabled={busy === "leave"}>
                {busy === "leave" ? "Leaving…" : "Yes, stop helping"}
              </button>
              <button className="link-btn muted" onClick={() => setConfirm(null)}>Stay</button>
            </div>
          ) : (
            <button className="btn danger-outline small" style={{ marginTop: 14 }} onClick={() => setConfirm("leave")}>
              Stop helping with this vault
            </button>
          )}
        </div>
      </main>
    );
  }

  const used = helpers.length + invites.length;

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>Helpers</h1>
      <p className="sans muted" style={{ marginBottom: 22, maxWidth: 660 }}>
        A helper is someone you trust to work in your vault with you — a family member, or a
        professional such as a daily money manager, organiser or your attorney&rsquo;s office.
        They sign in with their own account. You stay the owner: only you can invite or remove
        helpers, change billing, or veto and release an emergency request.
      </p>
      <p className="sans" style={{ marginBottom: 22, maxWidth: 660, fontSize: 14.5 }}>
        Helpers are different from <a href="/app/contacts">trusted contacts</a>: a trusted contact
        sees nothing until an emergency; a helper can see your vault now.
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 18 }}>{msg}</div>}
      {error && <div className="error sans" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>{error}</div>}

      <h2 style={{ fontSize: 22, marginBottom: 10 }}>
        Who can see this vault ({used} of {max})
      </h2>
      <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        {helpers.map((h) => (
          <div key={h.user_id} className="panel sans">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{h.email}</strong>
                <div className="muted" style={{ fontSize: 14 }}>
                  {grantText(h.grant_level)} · helping since {shortDate(h.created_at)}
                </div>
              </div>
              {confirm === h.user_id ? (
                <div className="row">
                  <span style={{ fontSize: 14 }}>Remove their access?</span>
                  <button className="btn danger small" disabled={busy !== ""} onClick={() => call("DELETE", { user_id: h.user_id }, h.user_id, `${h.email} no longer has access.`)}>
                    Yes, remove
                  </button>
                  <button className="link-btn muted" onClick={() => setConfirm(null)}>Keep</button>
                </div>
              ) : (
                <button className="link-btn danger" style={{ fontSize: 14.5 }} onClick={() => setConfirm(h.user_id)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="panel sans">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{i.email}</strong> <span className="chip warn">Invited · not accepted yet</span>
                <div className="muted" style={{ fontSize: 14 }}>
                  {grantText(i.grant_level)} · invitation expires {shortDate(i.expires_at)}
                </div>
              </div>
              <button className="link-btn danger" style={{ fontSize: 14.5 }} disabled={busy !== ""} onClick={() => call("DELETE", { invite_id: i.id }, i.id, `The invitation to ${i.email} was withdrawn.`)}>
                Withdraw
              </button>
            </div>
          </div>
        ))}
        {used === 0 && (
          <div className="panel sans">
            <h3>Just you</h3>
            <p>Nobody else can see this vault. That is the right setting for most people.</p>
          </div>
        )}
      </div>

      <div className="panel sans" style={{ maxWidth: 560 }}>
        <h3>Invite a helper</h3>
        <form onSubmit={invite} style={{ display: "grid", gap: 12 }}>
          <label>
            Their email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </label>
          <label>
            What they can do
            <select value={grant} onChange={(e) => setGrant(e.target.value)}>
              <option value="edit">Add and change things in my vault</option>
              <option value="view">Look only</option>
            </select>
          </label>
          <p style={{ fontSize: 14 }}>
            We email them a link that only works for that address. You&rsquo;ll get an email when
            they accept, and you can remove them at any time.
          </p>
          <button className="btn" type="submit" disabled={busy !== "" || used >= max}>
            {busy === "invite" ? "Sending…" : "Send invitation"}
          </button>
          {used >= max && <p style={{ fontSize: 14 }}>You&rsquo;ve reached {max} helpers. Remove one to invite another.</p>}
        </form>
      </div>
    </main>
  );
}
