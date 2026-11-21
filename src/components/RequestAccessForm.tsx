"use client";

import { useState } from "react";

// The trusted contact's page has two jobs, kept visibly apart:
//   1. today — confirm they received and saved their personal link;
//   2. one day — request access because something has happened.
export default function RequestAccessForm({
  token,
  alreadyConfirmed,
  requestInProgress,
  hasHistory,
}: {
  token: string;
  alreadyConfirmed: boolean;
  requestInProgress: boolean;
  hasHistory: boolean;
}) {
  const [confirmed, setConfirmed] = useState(alreadyConfirmed);
  const [open, setOpen] = useState(false);
  const [requestClass, setRequestClass] = useState("incapacity");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function acknowledge() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/contacts/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setConfirmed(true);
    } catch (e) {
      setErr((e as Error).message || "Could not save that just now. Please try again.");
    }
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/disclosure/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_token: token, request_class: requestClass, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setDone(new Date(json.release_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }));
    } catch (e) {
      setErr((e as Error).message || "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="panel sans" role="status">
        <h3>Your request has been recorded</h3>
        <p>
          The account owner is being notified and can stop the request during the waiting period.
          If they don&rsquo;t, the information they prepared for you will be emailed to you
          automatically after <strong>{done}</strong> (your local time), usually within a day of
          then.
        </p>
        <p style={{ marginTop: 8 }}>
          You don&rsquo;t need to do anything else. You can return to this page at any time to see
          where things stand.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {!hasHistory && (
        <div className="panel sans">
          <h3>For now: just keep this link safe</h3>
          <p>
            You can&rsquo;t see anything in the vault, and nothing is expected of you today. Save
            this page&rsquo;s address, or keep the email it came in, somewhere you&rsquo;ll find it
            if you ever need it.
          </p>
          {confirmed ? (
            <p style={{ marginTop: 10, color: "var(--green-dark)" }} role="status">
              ✓ Thank you — the owner can see that you have your link.
            </p>
          ) : (
            <button className="btn" style={{ marginTop: 12 }} onClick={acknowledge} disabled={busy}>
              {busy ? "Saving…" : "I've saved my link"}
            </button>
          )}
        </div>
      )}

      {!requestInProgress && (
        <div className="panel sans">
          <h3>If something has happened</h3>
          <p>
            If the account owner has died, or can no longer act for themselves, you can ask for the
            information they prepared for you. Nothing is released straight away: the owner is
            notified and has a waiting period to stop the request if it is a mistake.
          </p>
          {!open ? (
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
              Something has happened — request access
            </button>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 14 }}>
              <label>
                What has happened?
                <select value={requestClass} onChange={(e) => setRequestClass(e.target.value)}>
                  <option value="incapacity">They cannot act for themselves (illness, injury, incapacity)</option>
                  <option value="death">They have died</option>
                </select>
              </label>
              <label>
                In a sentence or two, what happened? (This is shown to the owner, so they can stop
                the request if it is a mistake.)
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} />
              </label>
              <div className="row">
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? "Sending…" : "Send my request"}
                </button>
                <button type="button" className="link-btn muted" onClick={() => setOpen(false)}>
                  Not now
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {err && <p className="error sans" role="alert">{err}</p>}
      <p className="sans muted" style={{ fontSize: 13 }}>
        We&rsquo;re sorry if you are here because of a loss. Take your time — this link does not expire.
      </p>
    </div>
  );
}
