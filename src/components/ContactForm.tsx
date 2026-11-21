"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// One verified-message form, used two ways:
//   - the general contact page (pick a topic, write a message);
//   - the partner application (mode="partner": a few structured questions,
//     sent through the same pipeline with the topic "partnership").
// Both confirm the sender's address with an emailed code before sending.
const PROFESSIONS = [
  "Daily money manager",
  "Professional organiser",
  "Aging life care manager",
  "Estate or elder-law attorney",
  "Financial planner or advisor",
  "Senior move manager",
  "End-of-life doula",
  "Other",
];

function ContactFormInner({ mode }: { mode?: "partner" }) {
  const params = useSearchParams();
  const partner = mode === "partner";
  const [form, setForm] = useState({
    name: "",
    email: "",
    topic: partner ? "partnership" : params.get("topic") || "general",
    message: "",
    website: "",
  });
  const [extra, setExtra] = useState({ profession: PROFESSIONS[0], business: "", clients: "" });
  const [step, setStep] = useState<"form" | "code" | "done">("form");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = partner
      ? [
          "Partner application",
          `Profession: ${extra.profession}`,
          `Business: ${extra.business.trim() || "(not given)"}`,
          `Clients helped per year: ${extra.clients.trim() || "(not given)"}`,
          "",
          form.message.trim() || "(no further notes)",
        ].join("\n")
      : form.message;
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, message }),
      });
      const data = await r.json();
      if (r.ok && data.ok) setStep("code");
      else setError(data.error || "Something went wrong.");
    } catch {
      setError("We couldn't reach KinWillow. Check your connection and try again.");
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
      setError("We couldn't reach KinWillow. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (step === "done") {
    return (
      <div className="card sans" role="status">
        <h2 style={{ textAlign: "left" }}>{partner ? "Application received" : "Message sent"}</h2>
        <p>
          {partner
            ? "Thank you. We read every application ourselves and reply within two business days."
            : "Thank you — your message is on its way. We reply within one business day."}
        </p>
      </div>
    );
  }
  if (step === "code") {
    return (
      <form className="card sans" onSubmit={verify}>
        <p>
          We emailed a 6-digit verification code to <strong>{form.email}</strong>. Enter it here to
          send your {partner ? "application" : "message"} — this keeps spam bots out of the inbox.
        </p>
        <label htmlFor="code">Verification code</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          autoFocus
        />
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Verify & send"}
        </button>
      </form>
    );
  }
  return (
    <form className="card sans" onSubmit={submit}>
      <label htmlFor="name">Your name</label>
      <input id="name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
      <label htmlFor="email">{partner ? "Work email" : "Email"}</label>
      <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
      {partner ? (
        <>
          <label htmlFor="profession">What you do</label>
          <select id="profession" value={extra.profession} onChange={(e) => setExtra({ ...extra, profession: e.target.value })} style={{ width: "100%" }}>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label htmlFor="business">Business or practice name</label>
          <input id="business" type="text" value={extra.business} onChange={(e) => setExtra({ ...extra, business: e.target.value })} required maxLength={120} autoComplete="organization" />
          <label htmlFor="clients">Roughly how many clients do you help each year?</label>
          <input id="clients" type="text" inputMode="numeric" value={extra.clients} onChange={(e) => setExtra({ ...extra, clients: e.target.value })} maxLength={20} />
          <label htmlFor="message">Anything else we should know? (optional)</label>
          <textarea id="message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={4000} style={{ width: "100%" }} />
        </>
      ) : (
        <>
          <label htmlFor="topic">Topic</label>
          <select id="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} style={{ width: "100%" }}>
            <option value="general">General question</option>
            <option value="setup-session">Founding setup session ($29 deposit)</option>
            <option value="checklist">The free checklist</option>
            <option value="parents">KinWillow for my parents</option>
            <option value="partnership">Becoming a partner</option>
            <option value="account-access">I can&rsquo;t get into my account</option>
            <option value="other">Something else</option>
          </select>
          <label htmlFor="message">Message</label>
          <textarea id="message" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required style={{ width: "100%" }} />
        </>
      )}
      {/* Honeypot — humans never see this */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} style={{ display: "none" }} aria-hidden="true" />
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "One moment…" : partner ? "Send my application" : "Continue"}
      </button>
      <p className="sans" style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
        We&rsquo;ll email you a short code to confirm the address is yours before {partner ? "the application" : "the message"} sends.
      </p>
    </form>
  );
}

export default function ContactForm({ mode }: { mode?: "partner" }) {
  return (
    <Suspense>
      <ContactFormInner mode={mode} />
    </Suspense>
  );
}
