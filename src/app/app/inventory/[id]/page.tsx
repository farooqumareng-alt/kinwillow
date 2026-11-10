"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem } from "@/lib/household";
import { CATEGORY_LABELS, type Category } from "@/lib/sections";

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
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("inventory_items").select("*").eq("id", params.id).single();
    setItem(data as InventoryItem);
    const { data: d } = await supabase
      .from("documents")
      .select("*")
      .eq("item_id", params.id)
      .order("created_at", { ascending: false });
    setDocs((d ?? []) as Doc[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save(field: string, value: string | null) {
    if (!item) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("inventory_items")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) setError(error.message);
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
      if (up.error) throw new Error(up.error.message);
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
      if (error) throw new Error(error.message);
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
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    await load();
  }

  if (!item) return <main><p className="sans">Loading…</p></main>;

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

      {msg && <div className="notice sans" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error sans" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="panel sans" style={{ marginBottom: 22, maxWidth: 640 }}>
        <h3 style={{ marginBottom: 10 }}>Details</h3>
        <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Title</label>
        <input type="text" defaultValue={item.title} key={`t-${item.id}`} onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && save("title", e.target.value.trim())} style={{ width: "100%" }} />
        <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Provider / institution</label>
        <input type="text" defaultValue={item.provider_name ?? ""} key={`p-${item.id}`} onBlur={(e) => save("provider_name", e.target.value.trim() || null)} style={{ width: "100%" }} />
        <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
          Notes — where it lives and how recovery works. <strong>Never a password.</strong>
        </label>
        <textarea rows={4} defaultValue={item.notes ?? ""} key={`n-${item.id}`} onBlur={(e) => save("notes", e.target.value.trim() || null)} style={{ width: "100%" }} />
        <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>Renewal / expiry date</label>
        <input type="date" defaultValue={item.renewal_date ?? ""} key={`r-${item.id}`} onBlur={(e) => save("renewal_date", e.target.value || null)} />
      </div>

      <div className="panel sans" style={{ maxWidth: 640 }}>
        <h3 style={{ marginBottom: 8 }}>Documents</h3>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>
          Upload a copy (a will, a policy, a deed). Files are stored privately, and each file&rsquo;s
          SHA-256 fingerprint is recorded at upload so tampering is detectable.
        </p>
        <input ref={fileRef} type="file" onChange={upload} disabled={busy} />
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
                <button onClick={() => removeDoc(doc)} style={{ background: "none", border: "none", color: "#7c2d20", cursor: "pointer", textDecoration: "underline" }}>Delete</button>
              </div>
            </div>
          ))}
          {docs.length === 0 && <p style={{ fontSize: 14, color: "var(--muted)" }}>No documents attached to this item yet.</p>}
        </div>
      </div>
    </main>
  );
}
