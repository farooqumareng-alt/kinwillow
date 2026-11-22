"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { suggestEmail } from "@/lib/email-typo";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState("");

  // A partner's referral link is /signup?partner=CODE. Remember the code for
  // this browser so it survives a visit to the pricing page first.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("partner");
    try {
      if (fromLink) localStorage.setItem("kw-partner", fromLink.slice(0, 32));
      setPartner(localStorage.getItem("kw-partner") ?? "");
    } catch {
      setPartner(fromLink ?? "");
    }
  }, []);

  const suggestion = suggestEmail(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, ...(partner ? { partner_code: partner } : {}) },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(friendlyError(error.message));
      setBusy(false);
      return;
    }
    if (data.session) {
      // The address has not been proven yet, so this session cannot open the
      // vault. Drop it and send the new user through the normal sign-in,
      // which emails the 6-digit code.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      window.location.assign("/login?created=1");
    } else {
      setNotice("Check your email to confirm your address — then sign in and your vault will be waiting.");
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 style={{ textAlign: "center" }}>Create your vault</h1>
      <p className="lede" style={{ marginBottom: 10 }}>
        Free to start: 25 items and 1 trusted contact. No card required.
      </p>
      {partner && (
        <p className="sans" style={{ textAlign: "center", fontSize: 14, color: "var(--green-dark)", marginBottom: 10 }}>
          You were referred by a KinWillow partner (code {partner.toUpperCase()}).
        </p>
      )}
      <form className="card sans" onSubmit={submit}>
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
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
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          At least 10 characters. Every sign-in also needs a one-time code we email you, and you
          can add an authenticator app inside the vault.
        </p>
        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create my free vault"}</button>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </form>
    </main>
  );
}
