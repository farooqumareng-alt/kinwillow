"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  status: string;
  request_token: string;
};
type Scope = { id: string; name: string; description: string | null };

export default function ContactsPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [contactScopes, setContactScopes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [scopeName, setScopeName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
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

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("trusted_contacts").insert({
      household_id: household.id,
      name,
      email,
      relationship: relationship || null,
      created_by: user?.id,
    });
    if (error) setMsg(error.message);
    else {
      setName("");
      setEmail("");
      setRelationship("");
      await load(household.id);
    }
  }

  async function addScope(e: React.FormEvent) {
    e.preventDefault();
    if (!household) return;
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("release_scopes").insert({ household_id: household.id, name: scopeName });
    if (error) setMsg(error.message);
    else {
      setScopeName("");
      await load(household.id);
    }
  }

  async function toggleScope(contactId: string, scopeId: string, on: boolean) {
    const supabase = createClient();
    if (on) await supabase.from("contact_scopes").insert({ contact_id: contactId, scope_id: scopeId });
    else await supabase.from("contact_scopes").delete().eq("contact_id", contactId).eq("scope_id", scopeId);
    if (household) await load(household.id);
  }

  async function removeContact(c: Contact) {
    const supabase = createClient();
    await supabase.from("trusted_contacts").update({ status: "removed" }).eq("id", c.id);
    if (household) await load(household.id);
  }

  if (loading) return <main><p className="sans">Loading…</p></main>;
  const limit = household?.plan_tier === "free" ? 1 : 5;

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Trusted contacts &amp; scopes
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24, maxWidth: 640 }}>
        Trusted contacts have no access to your vault in normal times. Each contact has a personal
        link they can use to request your recovery information in an emergency — release only ever
        happens after your waiting period, and you can veto it at any time. Scopes control which
        accounts a contact&rsquo;s package includes; accounts without a scope are included for
        every contact.
      </p>

      <h2 style={{ fontSize: 22, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Contacts ({contacts.length} of {limit} on your plan)
      </h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
        {contacts.map((c) => (
          <div key={c.id} className="panel sans">
            <strong>{c.name}</strong> · {c.email}
            {c.relationship ? ` · ${c.relationship}` : ""}
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
              Their personal request link (share it with them privately):{" "}
              <code>
                {origin}/request-access/{c.request_token}
              </code>
            </div>
            {scopes.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {scopes.map((s) => (
                  <label key={s.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={contactScopes[c.id]?.has(s.id) ?? false}
                      onChange={(e) => toggleScope(c.id, s.id, e.target.checked)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => removeContact(c)}>
              Remove contact
            </button>
          </div>
        ))}
        {contacts.length === 0 && <p className="sans">No trusted contacts yet.</p>}
      </div>

      <div className="grid">
        <div className="panel">
          <h3>Add a trusted contact</h3>
          <form onSubmit={addContact} className="sans" style={{ display: "grid", gap: 10 }}>
            <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Relationship<input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Daughter, Executor, Brother" /></label>
            <button type="submit" className="btn">Add contact</button>
          </form>
        </div>
        <div className="panel">
          <h3>Release scopes</h3>
          <p className="sans" style={{ color: "var(--muted)", marginBottom: 10 }}>
            Group accounts (e.g. &ldquo;Financial only&rdquo;) and assign each continuity record a
            scope on its page. {household?.plan_tier === "free" ? "Free includes 1 scope." : ""}
          </p>
          <ul className="sans" style={{ paddingLeft: 18, marginBottom: 12 }}>
            {scopes.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
          <form onSubmit={addScope} className="sans" style={{ display: "flex", gap: 8 }}>
            <input value={scopeName} onChange={(e) => setScopeName(e.target.value)} placeholder="New scope name" required />
            <button type="submit" className="btn">Add scope</button>
          </form>
        </div>
      </div>
      {msg && <p className="error sans" style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}
