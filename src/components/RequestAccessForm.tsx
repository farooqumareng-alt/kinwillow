"use client";

import { useState } from "react";

export default function RequestAccessForm({ token, contactName }: { token: string; contactName: string }) {
  const [requestClass, setRequestClass] = useState("incapacity");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/disclosure/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_token: token, request_class: requestClass, reason }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(json.error ?? "Something went wrong.");
      return;
    }
    setDone(
      `Your request has been recorded. The account owner has been notified and can stop (veto) the release at any time during the waiting period. If it is not stopped, the recovery package can be released after ${new Date(json.release_at).toLocaleString()}.`
    );
  }

  if (done)
    return (
      <div className="panel sans">
        <h3>Request recorded</h3>
        <p>{done}</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="panel sans" style={{ display: "grid", gap: 12 }}>
      <p>
        Hello {contactName}. You are listed as a trusted contact. If something has happened to the
        account owner, you can request the recovery information they prepared for you.
      </p>
      <label>
        What has happened?
        <select value={requestClass} onChange={(e) => setRequestClass(e.target.value)}>
          <option value="incapacity">The owner is incapacitated / cannot act for themselves</option>
          <option value="death">The owner has died</option>
        </select>
      </label>
      <label>
        Briefly, what happened? (shared with the owner / their household)
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Submitting starts a waiting period set by the owner. Nothing is released immediately, and
        the owner can cancel the release at any point during the wait.
      </p>
      {err && <p className="error">{err}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Submitting…" : "Request recovery information"}
      </button>
    </form>
  );
}
