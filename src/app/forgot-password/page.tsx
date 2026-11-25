"use client";
import { useState } from "react";
import { FieldError, useFieldErrors } from "@/lib/field-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const v = useFieldErrors();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("We couldn't send the email just now. Please try again in a moment.");
    }
    setBusy(false);
  }

  return (
    <main className="page">
      <h1 style={{ textAlign: "center" }}>Reset your password</h1>
      {sent ? (
        <div className="card sans">
          <div className="notice" role="status" style={{ marginTop: 0 }}>
            If <strong>{email}</strong> has a KinWillow account, a reset link is on its way. It
            expires shortly and works once. Check your spam folder if you don&rsquo;t see it.
          </div>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
            <a href="/login">Back to sign in</a>
          </p>
        </div>
      ) : (
        <form className="card sans" {...v.form(submit)}>
          <p style={{ fontSize: 15, color: "var(--muted)" }}>
            Enter the email you use for KinWillow and we&rsquo;ll send you a link to choose a new
            password.
          </p>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          <FieldError v={v} id="email" />
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
            <a href="/login">Back to sign in</a>
          </p>
        </form>
      )}
    </main>
  );
}
