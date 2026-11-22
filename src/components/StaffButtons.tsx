"use client";

import { useState } from "react";
import { runStaffAction } from "@/components/StaffAction";

export type StaffButton = {
  label: string;
  /** Shown in the prompt that asks for a reason. */
  what: string;
  payload: Record<string, unknown>;
  primary?: boolean;
};

/** A row of staff actions: each asks for a reason, runs, then reloads the page. */
export default function StaffButtons({ buttons }: { buttons: StaffButton[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(b: StaffButton) {
    setError("");
    setBusy(true);
    const result = await runStaffAction(b.payload, b.what);
    if (result === null) {
      window.location.reload();
      return;
    }
    setError(result);
    setBusy(false);
  }

  return (
    <div className="sans">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {buttons.map((b) => (
          <button key={b.label} className={b.primary ? "btn" : "btn btn-secondary"} disabled={busy} onClick={() => run(b)}>
            {b.label}
          </button>
        ))}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
