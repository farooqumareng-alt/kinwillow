"use client";
import { useState } from "react";

export default function ChecklistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "fallback">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const r = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(r.ok ? "done" : "fallback");
    } catch {
      setState("fallback");
    }
  }

  return (
    <>
      <form className="inline sans" onSubmit={submit}>
        <input
          type="email"
          placeholder="Your email address"
          required
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn-accent" type="submit" disabled={state === "busy"}>
          {state === "busy" ? "One moment…" : "Send me the checklist"}
        </button>
      </form>
      <p className="form-note sans">One email with your checklist. No spam, no selling your address — ever.</p>
      {state === "done" && (
        <div className="done-msg">
          Thank you — you&rsquo;re on the founding list, and your checklist is ready:{" "}
          <a href="/Family-Continuity-Checklist.pdf" download>
            <strong>Download the Family Continuity Checklist (PDF)</strong>
          </a>
        </div>
      )}
      {state === "fallback" && (
        <div className="done-msg" style={{ background: "#f7f1e6" }}>
          The list signup hiccuped, but your checklist is on us either way:{" "}
          <a href="/Family-Continuity-Checklist.pdf" download>
            <strong>Download the Family Continuity Checklist (PDF)</strong>
          </a>
        </div>
      )}
    </>
  );
}
