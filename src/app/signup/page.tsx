"use client";
import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { suggestEmail } from "@/lib/email-typo";
import { FieldError, useFieldErrors } from "@/lib/field-errors";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState("");
  const [plan, setPlan] = useState("");
  const [sentTo, setSentTo] = useState("");
  const v = useFieldErrors();

  // A partner's referral link is /signup?partner=CODE. Remember the code for
  // this browser so it survives a visit to the pricing page first.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fromLink = query.get("partner");
    const chosen = query.get("plan");
    if (chosen === "family" || chosen === "family_parents") setPlan(chosen);
    try {
      if (fromLink) localStorage.setItem("kw-partner", fromLink.slice(0, 32));
      setPartner(localStorage.getItem("kw-partner") ?? "");
    } catch {
      setPartner(fromLink ?? "");
    }
  }, []);

  const suggestion = suggestEmail(email);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const again = Boolean(sentTo);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, partner }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
      } else {
        setSentTo(email.trim());
        setNotice(
          `${again ? "We've sent the email again" : "We've sent an email"} to ${email.trim()}. Open it and press "Confirm my email" to open your vault. It can take a minute — check your spam folder too.`
        );
      }
    } catch {
      setError(friendlyError("Failed to fetch"));
    }
    setBusy(false);
  }

  return (
    <main className="page">
      <h1 style={{ textAlign: "center" }}>Create your vault</h1>
      <p className="lede" style={{ marginBottom: 10 }}>
        Free to start: 25 items and 1 trusted contact. No card required.
      </p>
      {plan && (
        <p className="sans" style={{ textAlign: "center", fontSize: 14, color: "var(--green-dark)", marginBottom: 10 }}>
          You chose {plan === "family" ? "Family ($79 a year)" : "Family + Parents ($129 a year)"}. Create your free vault
          first, then upgrade under Billing inside it.
        </p>
      )}
      {partner && (
        <p className="sans" style={{ textAlign: "center", fontSize: 14, color: "var(--green-dark)", marginBottom: 10 }}>
          You were referred by a KinWillow partner (code {partner.toUpperCase()}).
        </p>
      )}
      <form className="card sans" {...v.form(submit)}>
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <FieldError v={v} id="name" />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <FieldError v={v} id="email" />
        {suggestion && (
          <p role="status" style={{ fontSize: 14, marginTop: 8 }}>
            Did you mean{" "}
            <button
              type="button"
              onClick={() => setEmail(suggestion)}
              style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "var(--green-dark)", textDecoration: "underline", cursor: "pointer" }}
            >
              {suggestion}
            </button>
            ? Your sign-in codes are sent to this address.
          </p>
        )}
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={10} />
        <FieldError v={v} id="password" />
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          At least 10 characters. Every sign-in also needs a one-time code we email you, and you
          can add an authenticator app inside the vault.
        </p>
        {error && <div className="error" role="alert">{error}</div>}
        {notice && (
          <div className="notice" role="status">
            {notice}
            {sentTo && (
              <>
                {" "}Nothing after a few minutes?{" "}
                <button type="button" onClick={() => submit()} disabled={busy} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "var(--green-dark)", textDecoration: "underline", cursor: "pointer" }}>
                  Send it again
                </button>
              </>
            )}
          </div>
        )}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create my free vault"}</button>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </form>
    </main>
  );
}
