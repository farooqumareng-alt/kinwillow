"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Two-step sign-in: step 1 checks email + password and emails a 6-digit
// code; step 2 verifies the code before any session exists. The password
// is held in component state only, never persisted.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(): Promise<boolean> {
    const res = await fetch("/api/auth/login/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setError(data.error || "Something went wrong.");
      return false;
    }
    return true;
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
    const res = await fetch("/api/auth/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    router.push("/app");
    router.refresh();
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

  if (step === "code") {
    return (
      <main className="page">
        <h1 style={{ textAlign: "center" }}>Check your email</h1>
        <form className="card sans" onSubmit={submitCode}>
          <p style={{ fontSize: 15, color: "var(--muted)", textAlign: "center" }}>
            We sent a 6-digit sign-in code to <strong style={{ color: "var(--ink)" }}>{email}</strong>.
          </p>
          <label htmlFor="code">Sign-in code</label>
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
          {info && <div className="notice">{info}</div>}
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              style={{ background: "none", border: "none", padding: 0, color: "var(--green)", cursor: "pointer", fontSize: 14 }}
            >
              Resend code
            </button>
            {" · "}
            <button
              type="button"
              onClick={back}
              disabled={busy}
              style={{ background: "none", border: "none", padding: 0, color: "var(--green)", cursor: "pointer", fontSize: 14 }}
            >
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
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Sending code…" : "Continue"}</button>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
          New to KinWillow? <a href="/signup">Create your vault</a>
        </p>
      </form>
    </main>
  );
}
