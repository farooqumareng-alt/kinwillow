"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; status: string };

export default function SecurityPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }
  useEffect(() => {
    load();
  }, []);

  const verified = factors.some((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setBusy(false);
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error) {
      setError(challenge.error.message);
      setBusy(false);
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challenge.data.id,
      code,
    });
    if (verify.error) {
      setError(verify.error.message);
      setBusy(false);
      return;
    }
    setEnroll(null);
    setCode("");
    setMsg("Multi-factor authentication is on. Your vault is properly protected.");
    await load();
    setBusy(false);
  }

  async function removeFactor(id: string) {
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId: id });
    await load();
  }

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Security
      </h1>
      <p style={{ color: "#38443c", maxWidth: 640, marginBottom: 24 }}>
        Your vault holds the map to your whole digital life, so KinWillow asks for a second factor.
        Use any authenticator app (Google Authenticator, Authy, 1Password, Apple Passwords).
        MFA is required before you can add trusted contacts or recovery instructions.
      </p>

      {msg && <div className="notice sans" style={{ maxWidth: 640, marginBottom: 18 }}>{msg}</div>}
      {error && <div className="error sans" style={{ maxWidth: 640, marginBottom: 18 }}>{error}</div>}

      <div className="panel" style={{ maxWidth: 640 }}>
        <h3>Authenticator app (TOTP)</h3>
        {verified && <p>Status: <strong>On</strong> — thank you.</p>}
        {!verified && !enroll && (
          <>
            <p>Status: <strong>Off</strong>.</p>
            <button className="btn sans" onClick={startEnroll} disabled={busy} style={{ marginTop: 14 }}>
              {busy ? "Preparing…" : "Set up multi-factor authentication"}
            </button>
          </>
        )}
        {enroll && (
          <form onSubmit={confirmEnroll} className="sans">
            <p>Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="TOTP enrolment QR code" style={{ width: 180, height: 180, margin: "16px 0" }} />
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Can&rsquo;t scan? Enter this secret manually: <code>{enroll.secret}</code>
            </p>
            <label style={{ display: "block", margin: "14px 0 6px", fontSize: 14, color: "var(--muted)" }}>
              6-digit code
            </label>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required style={{ width: "100%" }} />
            <button className="btn" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
              {busy ? "Verifying…" : "Confirm & switch on"}
            </button>
          </form>
        )}
        {factors.length > 0 && (
          <div style={{ marginTop: 18 }}>
            {factors.map((f) => (
              <p key={f.id} className="sans" style={{ fontSize: 14 }}>
                Authenticator — {f.status}{" "}
                <button onClick={() => removeFactor(f.id)} style={{ background: "none", border: "none", color: "#7c2d20", cursor: "pointer", textDecoration: "underline" }}>
                  remove
                </button>
              </p>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
