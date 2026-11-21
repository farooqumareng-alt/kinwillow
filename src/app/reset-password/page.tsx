"use client";
import { useEffect, useState } from "react";

// Reached from the recovery email (via /auth/confirm or /auth/callback),
// which has already created a session for this browser.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/reset")
      .then((r) => r.json())
      .then((d) => {
        setSignedIn(Boolean(d.signed_in));
        setMfa(Boolean(d.mfa_required));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/reset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      if (data.mfa_required) setMfa(true);
      setError(data.error || "Something went wrong.");
      setBusy(false);
      return;
    }
    window.location.assign("/app");
  }

  if (!ready) return <main className="page"><p className="sans" style={{ textAlign: "center" }}>Loading…</p></main>;

  if (!signedIn) {
    return (
      <main className="page">
        <h1 style={{ textAlign: "center" }}>Reset link expired</h1>
        <div className="card sans">
          <p style={{ fontSize: 15, color: "var(--muted)" }}>
            This reset link has expired or was already used. Request a new one and open it within a
            few minutes.
          </p>
          <a className="btn" href="/forgot-password" style={{ display: "block", textAlign: "center", marginTop: 16 }}>
            Send a new reset link
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 style={{ textAlign: "center" }}>Choose a new password</h1>
      <form className="card sans" onSubmit={submit}>
        <label htmlFor="password">New password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" autoFocus />
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} autoComplete="new-password" />
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>At least 10 characters.</p>
        {mfa && (
          <>
            <label htmlFor="code">Authenticator code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
              Your account uses an authenticator app, so we need its 6-digit code to change the
              password.
            </p>
          </>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      </form>
    </main>
  );
}
