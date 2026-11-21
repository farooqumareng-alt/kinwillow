"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem } from "@/lib/household";
import { CATEGORY_LABELS, ACCOUNT_TYPES, COMMON_INSTITUTIONS, type Category } from "@/lib/sections";
import { friendlyError } from "@/lib/errors";

interface Doc {
  id: string;
  file_name: string;
  size_bytes: number | null;
  sha256: string;
  storage_path: string;
  created_at: string;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [scopes, setScopes] = useState<Array<{ id: string; name: string }>>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("inventory_items").select("*").eq("id", params.id).single();
    if (!data) {
      setMissing(true);
      return;
    }
    setItem(data as InventoryItem);
    const { data: d } = await supabase
      .from("documents")
      .select("*")
      .eq("item_id", params.id)
      .order("created_at", { ascending: false });
    setDocs((d ?? []) as Doc[]);
    if (data) {
      const { data: sc } = await supabase
        .from("release_scopes")
        .select("id, name")
        .eq("household_id", (data as InventoryItem).household_id)
        .order("created_at");
      setScopes((sc ?? []) as Array<{ id: string; name: string }>);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save(field: string, value: string | null) {
    if (!item) return;
    // Leaving a field without changing it is not a save.
    if (((item as unknown as Record<string, unknown>)[field] ?? null) === value) return;
    setError("");
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase
      .from("inventory_items")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) setError(friendlyError(error.message));
    else {
      setMsg("Saved.");
      await load();
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !item) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const supabase = createClient();
      const hash = await sha256Hex(file);
      const docId = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${item.household_id}/${docId}-${safeName}`;
      const up = await supabase.storage.from("documents").upload(path, file, { upsert: false });
      if (up.error) throw new Error(friendlyError(up.error.message));
      const { error } = await supabase.from("documents").insert({
        id: docId,
        household_id: item.household_id,
        item_id: item.id,
        storage_path: path,
        file_name: file.name,
        mime: file.type || null,
        size_bytes: file.size,
        sha256: hash,
      });
      if (error) {
        // Do not leave a stored file that the vault has no record of.
        await supabase.storage.from("documents").remove([path]);
        throw new Error(friendlyError(error.message));
      }
      setMsg(`Uploaded ${file.name} — its fingerprint (SHA-256) is recorded, so any later change is detectable.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function download(doc: Doc) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function removeDoc(doc: Doc) {
    const supabase = createClient();
    setError("");
    setMsg("");
    setConfirmDoc(null);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) {
      setError(friendlyError(error.message));
      return;
    }
    await supabase.storage.from("documents").remove([doc.storage_path]);
    setMsg(`${doc.file_name} was deleted.`);
    await load();
  }

  if (missing) {
    return (
      <main>
        <h1 style={{ marginBottom: 10 }}>Item not found</h1>
        <p className="sans">It may have been removed. <Link href="/app/inventory">Back to your vault</Link></p>
      </main>
    );
  }
  if (!item) return <main><p className="sans muted" role="status">Loading…</p></main>;

  return (
    <main>
      <p className="sans" style={{ marginBottom: 10 }}>
        <Link href="/app/inventory">← Back to your vault</Link>
      </p>
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 4 }}>{item.title}</h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        {CATEGORY_LABELS[item.category as Category] ?? item.category}
        {item.section ? ` · from checklist section ${item.section}` : ""}
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error sans" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="panel sans" style={{ marginBottom: 22, maxWidth: 640 }}>
        <h3 style={{ marginBottom: 10 }}>Details</h3>
        <label htmlFor="item-title" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Title</label>
        <input id="item-title" type="text" defaultValue={item.title} key={`t-${item.id}`} onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && save("title", e.target.value.trim())} style={{ width: "100%" }} />
        <label htmlFor="item-provider" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Provider / institution</label>
        <input id="item-provider" type="text" list="kw-institutions-detail" defaultValue={item.provider_name ?? ""} key={`p-${item.id}`} onBlur={(e) => save("provider_name", e.target.value.trim() || null)} style={{ width: "100%" }} />
        <datalist id="kw-institutions-detail">{COMMON_INSTITUTIONS.map((i) => (<option key={i} value={i} />))}</datalist>
        <label htmlFor="item-location" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Where is it stored?</label>
        <input id="item-location" type="text" defaultValue={item.location ?? ""} key={`l-${item.id}`} onBlur={(e) => save("location", e.target.value.trim() || null)} style={{ width: "100%" }} />
        {item.category === "account" && (<>
          <label htmlFor="item-account-type" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Account type</label>
          <select id="item-account-type" defaultValue={item.account_type ?? ""} key={`at-${item.id}`} onChange={(e) => save("account_type", e.target.value || null)} style={{ width: "100%" }}>
            <option value="">—</option>
            {ACCOUNT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <label htmlFor="item-last4" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Last 4 digits (never the full number)</label>
          <input id="item-last4" type="text" inputMode="numeric" maxLength={4} defaultValue={item.last4 ?? ""} key={`l4-${item.id}`} onBlur={(e) => save("last4", e.target.value.replace(/\D/g, "").slice(0, 4) || null)} style={{ width: 120 }} />
        </>)}
        <label htmlFor="item-notes" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
          Notes — where it lives and how recovery works. <strong>Never a password.</strong>
        </label>
        <textarea id="item-notes" rows={4} defaultValue={item.notes ?? ""} key={`n-${item.id}`} onBlur={(e) => save("notes", e.target.value.trim() || null)} style={{ width: "100%" }} />
        <label htmlFor="item-renewal" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Renewal / expiry date — we email you a reminder 30 days and 7 days before</label>
        <input id="item-renewal" type="date" defaultValue={item.renewal_date ?? ""} key={`r-${item.id}`} onBlur={(e) => save("renewal_date", e.target.value || null)} />
        <label htmlFor="item-scope" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
          Who receives this in an emergency
        </label>
        <select id="item-scope" defaultValue={item.release_scope_id ?? ""} key={`s-${item.id}`} onChange={(e) => save("release_scope_id", e.target.value || null)} style={{ width: "100%" }}>
          <option value="">Every trusted contact</option>
          {scopes.map((s) => (<option key={s.id} value={s.id}>Only contacts with the &ldquo;{s.name}&rdquo; scope</option>))}
        </select>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
          This item and its documents are included in the recovery package released to a trusted
          contact after your waiting period. Manage scopes under <Link href="/app/contacts">Contacts &amp; scopes</Link>.
        </p>
      </div>

      <div className="panel sans" style={{ maxWidth: 640 }}>
        <h3 style={{ marginBottom: 8 }}>Documents</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>
          Upload a copy (a will, a policy, a deed). Files are stored privately, and each file&rsquo;s
          SHA-256 fingerprint is recorded at upload so tampering is detectable.
        </p>
        <input ref={fileRef} type="file" aria-label="Upload a document" onChange={upload} disabled={busy} />
        {busy && <p style={{ fontSize: 14, marginTop: 8 }}>Uploading…</p>}
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {docs.map((doc) => (
            <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div>
                <div>{doc.file_name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB · ` : ""}SHA-256 {doc.sha256.slice(0, 12)}…
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => download(doc)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", textDecoration: "underline" }}>Download</button>
                {confirmDoc === doc.id ? (
                  <>
                    <button className="link-btn danger" onClick={() => removeDoc(doc)}>Yes, delete</button>
                    <button className="link-btn muted" onClick={() => setConfirmDoc(null)}>Keep</button>
                  </>
                ) : (
                  <button className="link-btn danger" onClick={() => setConfirmDoc(doc.id)}>Delete</button>
                )}
              </div>
            </div>
          ))}
          {docs.length === 0 && <p style={{ fontSize: 14, color: "var(--muted)" }}>No documents attached to this item yet.</p>}
        </div>
      </div>
    </main>
  );
}
