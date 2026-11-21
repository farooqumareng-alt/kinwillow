"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";
import { friendlyError, isPlanLimit } from "@/lib/errors";

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  status: string;
  request_token: string;
  invited_at: string | null;
  accepted_at: string | null;
};
type Scope = { id: string; name: string; description: string | null };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export default function ContactsPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [contactScopes, setContactScopes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [scopeName, setScopeName] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  async function load(hid: string) {
    const supabase = createClient();
    const { data: cs } = await supabase
      .from("trusted_contacts")
      .select("*")
      .eq("household_id", hid)
      .neq("status", "removed")
      .order("created_at");
    setContacts((cs ?? []) as Contact[]);
    const { data: ss } = await supabase.from("release_scopes").select("*").eq("household_id", hid).order("created_at");
    setScopes((ss ?? []) as Scope[]);
    const { data: links } = await supabase.from("contact_scopes").select("contact_id, scope_id");
    const map: Record<string, Set<string>> = {};
    for (const l of (links ?? []) as Array<{ contact_id: string; scope_id: string }>) {
      (map[l.contact_id] ??= new Set()).add(l.scope_id);
    }
    setContactScopes(map);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const h = await getMyHousehold();
      setHousehold(h);
      if (h) await load(h.id);
      setLoading(false);
    })();
  }, []);

  function fail(message: string | null | undefined) {
    setError(friendlyError(message));
    setUpgrade(isPlanLimit(message));
  }
  function clear() {
    setMsg(null);
    setError(null);
    setUpgrade(false);
  }

  async function invite(contact: Pick<Contact, "id" | "name">): Promise<boolean> {
    const res = await fetch("/api/contacts/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contact.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      fail(json.error ?? "The invitation could not be sent.");
      return false;
    }
    return true;
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    clear();
    setBusy("add");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("trusted_contacts")
      .insert({
        household_id: household.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        relationship: relationship.trim() || null,
        created_by: user?.id,
      })
      .select("id, name")
      .single();
    if (error || !data) {
      fail(error?.message);
      setBusy("");
      return;
    }
    const invited = sendInvite ? await invite(data as { id: string; name: string }) : false;
    setMsg(
      sendInvite
        ? invited
          ? `${data.name} was added, and we emailed them their personal link.`
          : `${data.name} was added, but the email could not be sent — use “Email their link” below to try again.`
        : `${data.name} was added. Remember to give them their personal link.`
    );
    setName("");
    setEmail("");
    setRelationship("");
    await load(household.id);
    setBusy("");
  }

  async function resend(c: Contact) {
    clear();
    setBusy(`invite:${c.id}`);
    if (await invite(c)) setMsg(`We emailed ${c.name} their personal link.`);
    if (household) await load(household.id);
    setBusy("");
  }

  async function copyLink(c: Contact) {
    const link = `${origin}/request-access/${c.request_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(c.id);
      window.setTimeout(() => setCopied((id) => (id === c.id ? null : id)), 2500);
    } catch {
      setError("Your browser blocked copying. Select the link text and copy it by hand.");
    }
  }

  async function addScope(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    clear();
    const supabase = createClient();
    const { error } = await supabase.from("release_scopes").insert({ household_id: household.id, name: scopeName.trim() });
    if (error) fail(error.message);
    else {
      setScopeName("");
      await load(household.id);
    }
  }

  async function toggleScope(contactId: string, scopeId: string, on: boolean) {
    clear();
    const supabase = createClient();
    const { error } = on
      ? await supabase.from("contact_scopes").insert({ contact_id: contactId, scope_id: scopeId })
      : await supabase.from("contact_scopes").delete().eq("contact_id", contactId).eq("scope_id", scopeId);
    if (error) fail(error.message);
    if (household) await load(household.id);
  }

  async function removeContact(c: Contact) {
    clear();
    const supabase = createClient();
    const { error } = await supabase.from("trusted_contacts").update({ status: "removed" }).eq("id", c.id);
    setConfirmRemove(null);
    if (error) fail(error.message);
    else setMsg(`${c.name} was removed. Their personal link no longer works.`);
    if (household) await load(household.id);
  }

  if (loading) return <main><p className="sans muted" role="status">Loading…</p></main>;
  const limit = household?.plan_tier === "free" ? 1 : 5;

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>Trusted contacts &amp; scopes</h1>
      <p className="sans muted" style={{ marginBottom: 24, maxWidth: 640 }}>
        Trusted contacts have no access to your vault in normal times. Each one has a personal link
        they can use to request your recovery information in an emergency. Release only happens
        after your waiting period, and you can veto it. Scopes control which vault items and
        accounts a contact&rsquo;s package includes; anything without a scope goes to every contact.
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 18 }}>{msg}</div>}
      {error && (
        <div className="error sans" role="alert" style={{ marginTop: 0, marginBottom: 18 }}>
          {error} {upgrade && <Link href="/app/billing">See plans</Link>}
        </div>
      )}

      <h2 style={{ fontSize: 22, marginBottom: 10 }}>
        Contacts ({contacts.length} of {limit} on your plan)
      </h2>
      <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        {contacts.map((c) => (
          <div key={c.id} className="panel sans">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 17 }}>{c.name}</strong>
                <div className="muted" style={{ fontSize: 14 }}>
                  {c.email}
                  {c.relationship ? ` · ${c.relationship}` : ""}
                </div>
              </div>
              {c.status === "accepted" ? (
                <span className="chip good">Has their link{c.accepted_at ? ` · confirmed ${shortDate(c.accepted_at)}` : ""}</span>
              ) : c.invited_at ? (
                <span className="chip warn">Emailed {shortDate(c.invited_at)} · not confirmed yet</span>
              ) : (
                <span className="chip bad">Not told yet</span>
              )}
            </div>

            {scopes.length > 0 && (
              <fieldset style={{ border: "none", marginTop: 14 }}>
                <legend style={{ fontSize: 14, color: "#38443c", marginBottom: 6 }}>
                  Scopes {c.name} holds
                </legend>
                <div className="row">
                  {scopes.map((s) => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={contactScopes[c.id]?.has(s.id) ?? false}
                        onChange={(e) => toggleScope(c.id, s.id, e.target.checked)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn small" onClick={() => resend(c)} disabled={busy === `invite:${c.id}`}>
                {busy === `invite:${c.id}` ? "Sending…" : c.invited_at ? "Email their link again" : "Email their link"}
              </button>
              <button className="btn secondary small" onClick={() => copyLink(c)}>
                {copied === c.id ? "Copied ✓" : "Copy link"}
              </button>
              {confirmRemove === c.id ? (
                <>
                  <span style={{ fontSize: 14 }}>Remove {c.name}? Their link will stop working.</span>
                  <button className="btn danger small" onClick={() => removeContact(c)}>Yes, remove</button>
                  <button className="link-btn muted" onClick={() => setConfirmRemove(null)}>Keep</button>
                </>
              ) : (
                <button className="link-btn danger" style={{ fontSize: 14 }} onClick={() => setConfirmRemove(c.id)}>
                  Remove
                </button>
              )}
            </div>
            <details style={{ marginTop: 10 }}>
              <summary className="muted" style={{ fontSize: 13, cursor: "pointer" }}>Show their personal link</summary>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                Share it privately — anyone holding this link can start an emergency request.
                <br />
                <code>{origin}/request-access/{c.request_token}</code>
              </p>
            </details>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="panel sans">
            <h3>No trusted contacts yet</h3>
            <p>
              Until you name someone, nobody can reach what you&rsquo;ve organised here. Add the
              person your family would turn to first — a spouse, an adult child, or your executor.
            </p>
          </div>
        )}
      </div>

      <div className="grid">
        <div className="panel sans">
          <h3>Add a trusted contact</h3>
          <form onSubmit={addContact} style={{ display: "grid", gap: 12 }}>
            <label>Full name<input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></label>
            <label>
              Relationship (optional)
              <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Daughter, Executor, Brother" />
            </label>
            <label>
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
              Email them their personal link now, with an explanation
            </label>
            <button type="submit" className="btn" disabled={busy === "add" || contacts.length >= limit}>
              {busy === "add" ? "Adding…" : "Add contact"}
            </button>
            {contacts.length >= limit && (
              <p style={{ fontSize: 14 }}>
                Your plan includes {limit} trusted contact{limit === 1 ? "" : "s"}.{" "}
                {limit === 1 && <Link href="/app/billing">Upgrade for up to 5</Link>}
              </p>
            )}
          </form>
        </div>
        <div className="panel sans">
          <h3>Release scopes</h3>
          <p style={{ marginBottom: 10 }}>
            A scope is a group, such as &ldquo;Financial only&rdquo;. Give a scope to a vault item or
            continuity record on its page, then tick it for the contacts who should receive those.{" "}
            {household?.plan_tier === "free" ? "Free includes 1 scope." : ""}
          </p>
          {scopes.length > 0 && (
            <ul style={{ paddingLeft: 18, marginBottom: 12 }}>
              {scopes.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
          )}
          <form onSubmit={addScope} style={{ display: "grid", gap: 10 }}>
            <label>
              New scope name
              <input type="text" value={scopeName} onChange={(e) => setScopeName(e.target.value)} required />
            </label>
            <button type="submit" className="btn secondary">Add scope</button>
          </form>
        </div>
      </div>
    </main>
  );
}
