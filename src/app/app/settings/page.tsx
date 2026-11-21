"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  family: "Family",
  family_parents: "Family + Parents",
};
const GRACE_DAYS = 30;

export default function SettingsPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [deletionAt, setDeletionAt] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setHousehold(await getMyHousehold());
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("deletion_requested_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setDeletionAt((data?.deletion_requested_at as string | null) ?? null);
    })();
  }, []);

  const deleteOn = deletionAt ? new Date(new Date(deletionAt).getTime() + GRACE_DAYS * 24 * 3600_000) : null;

  async function requestDeletion(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not schedule the deletion.");
      return;
    }
    setPassword("");
    setShowDelete(false);
    setDeletionAt(new Date().toISOString());
    setMsg("Deletion scheduled. We've emailed you a confirmation.");
  }

  async function cancelDeletion() {
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not cancel the deletion.");
      return;
    }
    setDeletionAt(null);
    setMsg("Deletion cancelled. Your vault is staying.");
  }

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Settings
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        {household
          ? `${household.name} · Plan: ${PLAN_NAMES[household.plan_tier] ?? household.plan_tier}${household.status === "sealed" ? " · Sealed (read-only)" : ""}`
          : ""}
      </p>

      {msg && <div className="notice sans" role="status" style={{ marginBottom: 18 }}>{msg}</div>}
      {error && <div className="error sans" role="alert" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="grid">
        <div className="panel sans">
          <h3>Export your data</h3>
          <p>
            Download what is in your vault as a single file — items, the list of your documents,
            continuity records with your recovery instructions, contacts, scopes, emergency
            requests and your activity log. Always available, even if billing lapses. Uploaded
            files themselves are downloaded from each item.
          </p>
          <a className="btn" style={{ marginTop: 10, display: "inline-block" }} href="/api/export">
            Download my export
          </a>
        </div>
        <div className="panel sans">
          <h3>Security</h3>
          <p>
            Every sign-in needs your password and a code we email you. You can add an authenticator
            app for a stronger second step.
          </p>
          <a className="btn" style={{ marginTop: 10, display: "inline-block" }} href="/app/security">
            Open Security
          </a>
        </div>
        <div className="panel sans">
          <h3>Delete this account</h3>
          {deleteOn ? (
            <>
              <p>
                <strong>Deletion is scheduled.</strong> Your vault, documents, trusted contacts and
                sign-in will be permanently deleted on or shortly after{" "}
                <strong>{deleteOn.toLocaleDateString(undefined, { dateStyle: "long" })}</strong>.
                Until then nothing changes, and you can cancel.
              </p>
              <button className="btn" style={{ marginTop: 10 }} onClick={cancelDeletion} disabled={busy}>
                {busy ? "Cancelling…" : "Cancel the deletion"}
              </button>
            </>
          ) : showDelete ? (
            <form onSubmit={requestDeletion}>
              <p>
                This permanently deletes your vault, uploaded documents, trusted contacts and
                sign-in after a {GRACE_DAYS}-day grace period, and cancels any paid plan. Your
                trusted contacts will no longer be able to request access. Download an export first.
              </p>
              <label htmlFor="delete-password" style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
                Enter your password to confirm
              </label>
              <input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ background: "#7c2d20", color: "#fff", border: "none", borderRadius: 6, padding: "11px 20px", fontSize: 15, cursor: "pointer" }}
                >
                  {busy ? "Scheduling…" : `Delete my account in ${GRACE_DAYS} days`}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDelete(false); setPassword(""); }}
                  style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", textDecoration: "underline", fontSize: 15 }}
                >
                  Keep my account
                </button>
              </div>
            </form>
          ) : (
            <>
              <p>
                Deletion only ever happens at your explicit request, and takes effect after a{" "}
                {GRACE_DAYS}-day grace period during which you can change your mind. If billing
                simply lapses, your vault is sealed — never deleted.
              </p>
              <button
                onClick={() => setShowDelete(true)}
                style={{ marginTop: 10, background: "none", border: "1px solid #7c2d20", color: "#7c2d20", borderRadius: 6, padding: "10px 18px", fontSize: 15, cursor: "pointer" }}
              >
                Delete my account…
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
