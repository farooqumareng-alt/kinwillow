"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Sign-in: step 1 checks email + password and emails a 6-digit code; step 2
// verifies the code before any usable session exists; step 3 (only when an
// authenticator app is switched on) asks for its code. The password is held
// in component state only, never persisted.
type Step = "password" | "code" | "mfa";

const linkButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--green)",
  cursor: "pointer",
  fontSize: 14,
} as const;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [next, setNext] = useState("/app");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // Read the query string on the client (keeps this page statically renderable).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("next");
    // Only ever return to a page inside the vault — never an outside URL.
    if (target && /^\/app(\/[\w\-/]*)?$/.test(target)) setNext(target);
    if (params.get("step") === "mfa") setStep("mfa");
    if (params.get("created") === "1") {
      setInfo("Your vault is created. Sign in to open it — we'll email you a 6-digit code.");
    }
    if (params.get("idle") === "1") {
      setInfo("You were signed out after 30 minutes without activity, to keep your vault safe.");
    }
    if (params.get("error") === "auth") {
      setError("That link didn't work or has expired. Please sign in below.");
    }
  }, []);

  function finish() {
    // A full navigation, so the server sees the new session cookies.
    window.location.assign(next);
  }

  async function post(url: string, body: Record<string, string>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok === true, data };
  }

  async function requestCode(): Promise<boolean> {
    const { ok, data } = await post("/api/auth/login/start", { email, password });
    if (!ok) setError(data.error || "Something went wrong.");
    return ok;
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const ok = await requestCode();
    setBusy(false);
    if (!ok) return;
    setStep("code");
    setInfo(`We sent a 6-digit code to ${email}. It expires in 15 minutes.`);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const { ok, data } = await post("/api/auth/login/verify", { email, password, code });
    if (!ok) {
      setBusy(false);
      setError(data.error || "Something went wrong.");
      return;
    }
    if (data.mfa_required) {
      setBusy(false);
      setCode("");
      setStep("mfa");
      return;
    }
    finish();
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const { ok, data } = await post("/api/auth/login/mfa", { code });
    if (!ok) {
      setBusy(false);
      setError(data.error || "Something went wrong.");
      return;
    }
    finish();
  }

  async function resend() {
    setBusy(true);
    setError("");
    setInfo("");
    const ok = await requestCode();
    setBusy(false);
    if (!ok) return;
    setCode("");
    setInfo(`A new code is on its way to ${email}. It expires in 15 minutes.`);
  }

  function back() {
    setStep("password");
    setCode("");
    setError("");
    setInfo("");
  }

  async function startOver() {
    setBusy(true);
    await createClient().auth.signOut({ scope: "local" }).catch(() => {});
    window.location.assign("/login");
  }

  const codeInput = (
    <input
      id="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]{6}"
      placeholder="123456"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
      required
      autoFocus
    />
  );

  if (step === "mfa") {
    return (
      <main className="page">
        <h1 style={{ textAlign: "center" }}>Authenticator code</h1>
        <form className="card sans" onSubmit={submitMfa}>
          <p style={{ fontSize: 15, color: "var(--muted)", textAlign: "center" }}>
            Open your authenticator app and enter the 6-digit code it shows for KinWillow.
          </p>
          <label htmlFor="code">Authenticator code</label>
          {codeInput}
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and open my vault"}</button>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={startOver} disabled={busy} style={linkButton}>
              Sign in as someone else
            </button>
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, textAlign: "center" }}>
            Lost your authenticator? <a href="/contact">Contact us</a> and we&rsquo;ll help you back in.
          </p>
        </form>
      </main>
    );
  }

  if (step === "code") {
    return (
      <main className="page">
        <h1 style={{ textAlign: "center" }}>Check your email</h1>
        <form className="card sans" onSubmit={submitCode}>
          <p style={{ fontSize: 15, color: "var(--muted)", textAlign: "center" }}>
            We sent a 6-digit sign-in code to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
          </p>
          <label htmlFor="code">Sign-in code</label>
          {codeInput}
          {info && <div className="notice" role="status">{info}</div>}
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={resend} disabled={busy} style={linkButton}>
              Resend code
            </button>
            {" · "}
            <button type="button" onClick={back} disabled={busy} style={linkButton}>
              Back
            </button>
          </p>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 style={{ textAlign: "center" }}>Sign in</h1>
      <form className="card sans" onSubmit={submitPassword}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {info && <div className="notice" role="status">{info}</div>}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Sending code…" : "Continue"}</button>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
          <a href="/forgot-password">Forgot your password?</a>
        </p>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
          New to KinWillow? <a href="/signup">Create your vault</a>
        </p>
      </form>
    </main>
  );
}
