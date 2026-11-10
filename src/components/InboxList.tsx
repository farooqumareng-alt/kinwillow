"use client";

import { useState } from "react";

export type InboxItem = {
  id: string;
  kind: "messages" | "signups";
  title: string;
  detail: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

export default function InboxList({ items }: { items: InboxItem[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function setState(item: InboxItem, patch: { read?: boolean; archived?: boolean }) {
    setBusy(item.id);
    await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "inbox_state", table: item.kind, id: item.id, ...patch }),
    });
    window.location.reload();
  }

  const visible = items.filter((i) => showArchived || !i.archived_at);
  return (
    <div className="sans">
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived
      </label>
      <div style={{ display: "grid", gap: 10 }}>
        {visible.map((i) => (
          <div key={`${i.kind}-${i.id}`} className="panel" style={{ opacity: i.archived_at ? 0.6 : 1 }}>
            <strong>{i.kind === "messages" ? "Message" : "Checklist signup"}</strong> · {i.title}
            {!i.read_at && <span className="chip" style={{ marginLeft: 8 }}>unread</span>}
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{new Date(i.created_at).toLocaleString()}</div>
            <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{i.detail}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn secondary" disabled={busy === i.id} onClick={() => setState(i, { read: !i.read_at })}>
                Mark {i.read_at ? "unread" : "read"}
              </button>
              <button className="btn secondary" disabled={busy === i.id} onClick={() => setState(i, { archived: !i.archived_at })}>
                {i.archived_at ? "Unarchive" : "Archive"}
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p>Nothing here.</p>}
      </div>
    </div>
  );
}
