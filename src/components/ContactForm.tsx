"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ContactFormInner() {
  const params = useSearchParams();
  const [form, setForm] = useState({
    name: "",
    email: "",
    topic: params.get("topic") || "general",
    message: "",
    website: "",
  });
  const [step, setStep] = useState<"form" | "code" | "done">("form");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (r.ok && data.ok) setStep("code");
      else setError(data.error || "Something went wrong.");
    } catch {
      setError("Something went wrong.");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/contact/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code }),
      });
      const data = await r.json();
      if (r.ok && data.ok) setStep("done");
      else setError(data.error || "Something went wrong.");
    } catch {
      setError("Something went wrong.");
    }
    setBusy(false);
  }

  if (step === "done") {
    return (
      <div className="card sans">
        <h2 style={{ textAlign: "left" }}>Message sent</h2>
        <p>Thank you — your message is on its way. We reply within one business day.</p>
      </div>
    );
  }
  if (step === "code") {
    return (
      <form className="card sans" onSubmit={verify}>
        <p>
          We emailed a 6-digit verification code to <strong>{form.email}</strong>. Enter it here to
          send your message — this keeps spam bots out of the inbox.
        </p>
        <label htmlFor="code">Verification code</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Verify & send"}
        </button>
      </form>
    );
  }
  return (
    <form className="card sans" onSubmit={submit}>
      <label htmlFor="name">Your name</label>
      <input id="name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <label htmlFor="topic">Topic</label>
      <select id="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} style={{ width: "100%" }}>
        <option value="general">General question</option>
        <option value="setup-session">Founding setup session ($29 deposit)</option>
        <option value="checklist">The free checklist</option>
        <option value="parents">KinWillow for my parents</option>
        <option value="other">Something else</option>
      </select>
      <label htmlFor="message">Message</label>
      <textarea id="message" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required style={{ width: "100%" }} />
      {/* Honeypot — humans never see this */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} style={{ display: "none" }} aria-hidden="true" />
      {error && <div className="error">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "One moment…" : "Continue"}
      </button>
      <p className="sans" style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
        We&rsquo;ll email you a short code to confirm the address is yours before the message sends.
      </p>
    </form>
  );
}

export default function ContactForm() {
  return (
    <Suspense>
      <ContactFormInner />
    </Suspense>
  );
}
