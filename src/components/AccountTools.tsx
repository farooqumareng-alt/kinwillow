"use client";

import { useState } from "react";
import { runStaffAction } from "@/components/StaffAction";

export default function AccountTools({ userId, email, confirmed }: { userId: string; email: string; confirmed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function send(action: "send_reset" | "send_confirmation", what: string, success: string) {
    setError("");
    setDone("");
    setBusy(true);
    const result = await runStaffAction({ action, user_id: userId }, what);
    if (result === null) setDone(success);
    else setError(result);
    setBusy(false);
  }

  return (
    <div className="sans">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => send("send_reset", `Send a password-reset email to ${email}.`, `Password-reset email sent to ${email}.`)}
        >
          Send password-reset email
        </button>
        {!confirmed && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => send("send_confirmation", `Send a new confirmation link to ${email}.`, `Confirmation link sent to ${email}.`)}
          >
            Send a new confirmation link
          </button>
        )}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {done && <div className="notice" role="status">{done}</div>}
    </div>
  );
}
