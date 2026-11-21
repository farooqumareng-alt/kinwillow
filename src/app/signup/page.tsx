"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
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
      <form className="card sans" onSubmit={submit}>
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
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
