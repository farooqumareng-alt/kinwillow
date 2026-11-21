"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold } from "@/lib/household";

type Entry = { id: string; actor: string | null; action: string; created_at: string };

// Plain-English names for the events written to the activity log.
const LABELS: Record<string, string> = {
  "disclosure.requested": "A trusted contact requested emergency access",
  "disclosure.vetoed": "An emergency request was vetoed",
  "disclosure.package_generated": "A recovery package was released by the owner",
  "disclosure.package_auto_released": "A recovery package was released automatically after the waiting period",
  "disclosure.package_accessed": "A trusted contact opened their recovery package",
  "disclosure.document_downloaded": "A trusted contact downloaded a document from their package",
  "household.exported": "The vault was exported",
  "household.printed": "The printable binder was opened",
  "household.created": "This vault was created",
  "continuity.recovery_path_revealed": "Recovery instructions were viewed",
  "continuity.key_location_revealed": "An access-key location was viewed",
};

function describe(action: string): string {
  if (LABELS[action]) return LABELS[action];
  if (action.startsWith("billing.subscription_")) {
    return `Billing: subscription ${action.slice("billing.subscription_".length).replace(/_/g, " ")}`;
  }
  // Unknown events are still shown, in a readable form, never hidden.
  const text = action.replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
      const household = await getMyHousehold();
      if (!household) {
        setEntries([]);
        return;
      }
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, actor, action, created_at")
        .eq("household_id", household.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) setError("The activity log could not be loaded. Please refresh the page.");
      setEntries((data ?? []) as Entry[]);
    })();
  }, []);

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Activity log
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24, maxWidth: 640 }}>
        Every important event in your vault, newest first. Entries are written by KinWillow, chained
        to the one before, and cannot be edited or removed — by you or by us through the app.
      </p>
      {error && <div className="error sans" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
      {entries === null ? (
        <p className="sans">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="sans">
          Nothing yet. Exports, views of recovery instructions and emergency requests will appear here.
        </p>
      ) : (
        <div className="panel sans" style={{ maxWidth: 760, padding: 0 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {entries.map((e, i) => (
              <li
                key={e.id}
                style={{ padding: "14px 22px", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <div>{describe(e.action)}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                  {new Date(e.created_at).toLocaleString()} ·{" "}
                  {e.actor ? (e.actor === me ? "You" : "Another household member") : "KinWillow (automatic) or a trusted contact"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entries && entries.length === 200 && (
        <p className="sans" style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
          Showing the latest 200 entries. Your export contains the full log.
        </p>
      )}
    </main>
  );
}
