"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  STATE_LABELS,
  effectiveState,
  sha256Hex,
  type ContinuityRecord,
  type VerifiedState,
} from "@/lib/continuity";

type Provider = {
  id: string;
  name: string;
  mechanism_type: string;
  walkthrough: string[];
  accepts_confirmation: boolean;
  recheck_months: number;
  recovery_summary: string;
};
type Transition = { id: string; from_state: string | null; to_state: string; reason: string | null; created_at: string };

export default function ContinuityRecordPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [record, setRecord] = useState<ContinuityRecord | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [attest, setAttest] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState("");
  const [keyLocation, setKeyLocation] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data: rec } = await supabase.from("continuity_records").select("*").eq("id", id).single();
    if (rec) {
      setRecord(rec as ContinuityRecord);
      const { data: prov } = await supabase
        .from("provider_catalog")
        .select("*")
        .eq("id", (rec as ContinuityRecord).provider_id)
        .single();
      setProvider(prov as Provider);
      const { data: tr } = await supabase
        .from("state_transitions")
        .select("*")
        .eq("record_id", id)
        .order("created_at", { ascending: false });
      setTransitions((tr ?? []) as Transition[]);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function transition(to: VerifiedState, reason: string, extra: Record<string, unknown> = {}) {
    if (!record) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("continuity_records")
      .update({ verified_state: to, updated_at: new Date().toISOString(), ...extra })
      .eq("id", record.id);
    await supabase.from("state_transitions").insert({
      record_id: record.id,
      household_id: record.household_id,
      from_state: record.verified_state,
      to_state: to,
      actor: user?.id,
      reason,
    });
    await supabase.rpc("append_audit", {
      p_household: record.household_id,
      p_actor: user?.id,
      p_action: `continuity.state_${to}`,
      p_entity: "continuity_record",
      p_entity_id: record.id,
    });
  }

  async function submitEvidence() {
    if (!record || !provider) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const recheck = new Date();
    recheck.setMonth(recheck.getMonth() + provider.recheck_months);
    const recheckDue = recheck.toISOString().slice(0, 10);

    if (confirmation.trim() && provider.accepts_confirmation) {
      const hash = await sha256Hex(confirmation.trim());
      await supabase.from("evidence_artifacts").insert({
        record_id: record.id,
        household_id: record.household_id,
        kind: "confirmation_text",
        content_hash: hash,
        created_by: user?.id,
      });
      await transition("evidence_verified", "Provider confirmation captured", {
        evidence_type: "confirmation_text",
        evidence_hash: hash,
        evidence_at: new Date().toISOString(),
        recheck_due: recheckDue,
        drift_state: "none",
      });
      setMsg("Verified. The confirmation text itself was not stored — only its fingerprint.");
    } else if (attest) {
      const statement = `Attested setup of ${provider.name} ${provider.mechanism_type} for ${record.account_ref ?? "account"} on ${new Date().toISOString()}`;
      const hash = await sha256Hex(statement);
      await supabase.from("evidence_artifacts").insert({
        record_id: record.id,
        household_id: record.household_id,
        kind: "attestation",
        content_hash: hash,
        created_by: user?.id,
      });
      await transition("attested", "Owner attestation", {
        evidence_type: "attestation",
        evidence_hash: hash,
        evidence_at: new Date().toISOString(),
        recheck_due: recheckDue,
        drift_state: "none",
      });
      setMsg("Recorded as attested. A provider confirmation raises this to Verified.");
    } else {
      setMsg("Paste the provider's confirmation, or tick the attestation box.");
    }
    setBusy(false);
    await load();
  }

  async function saveFields() {
    if (!record) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/continuity/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_id: record.id, recovery_path: recoveryPath, key_location: keyLocation }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Could not save.");
      return;
    }
    setRecoveryPath("");
    setKeyLocation("");
    setMsg("Saved — stored encrypted, never in plain text.");
    await load();
  }

  async function reveal(field: "recovery_path" | "key_location") {
    const res = await fetch("/api/continuity/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_id: id, field }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setRevealed((r) => ({ ...r, [field]: json.value ?? "—" }));
    else setMsg(json.error ?? "Could not reveal.");
  }

  if (loading) return <main><p className="sans">Loading…</p></main>;
  if (!record || !provider)
    return (
      <main>
        <p className="sans">This check could not be found. <a href="/app/continuity">Back to the Continuity Centre</a></p>
      </main>
    );

  const state = effectiveState(record);
  const verified = record.verified_state === "evidence_verified";

  return (
    <main>
      <p className="sans" style={{ marginBottom: 8 }}>
        <a href="/app/continuity">← Continuity Centre</a>
      </p>
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 4 }}>
        {provider.name} — {provider.mechanism_type}
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 20 }}>
        {record.account_ref ?? "Account"} · Status: <strong>{STATE_LABELS[state]}</strong>
        {record.recheck_due ? ` · Re-check by ${record.recheck_due}` : ""}
        {record.designated_recipient ? ` · Contact: ${record.designated_recipient}` : ""}
      </p>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h3>Do it at {provider.name}</h3>
        <ol className="sans" style={{ paddingLeft: 20, display: "grid", gap: 6 }}>
          {provider.walkthrough.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="sans" style={{ marginTop: 12, color: "var(--muted)" }}>
          How recovery works later: {provider.recovery_summary}
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h3>Prove it</h3>
        {provider.accepts_confirmation ? (
          <div className="sans" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
            <label>
              Paste the confirmation {provider.name} showed you (we keep only a fingerprint of it —
              the text itself is never stored)
              <textarea rows={3} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </label>
          </div>
        ) : (
          <p className="sans" style={{ maxWidth: 560 }}>
            {provider.name} shows no confirmation screen we can fingerprint, so this check is
            verified by your attestation.
          </p>
        )}
        <label className="sans" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, maxWidth: 560 }}>
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
          <span>I confirm I completed these steps at {provider.name} and named{" "}
            {record.designated_recipient ?? "my trusted person"}.</span>
        </label>
        <button className="btn" onClick={submitEvidence} disabled={busy} style={{ marginTop: 12 }}>
          {busy ? "Saving…" : verified ? "Re-verify with fresh evidence" : "Record the evidence"}
        </button>
        {record.evidence_hash && (
          <p className="sans" style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Evidence fingerprint: {record.evidence_hash.slice(0, 16)}… · captured{" "}
            {record.evidence_at ? new Date(record.evidence_at).toLocaleDateString() : ""}
          </p>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h3>Recovery instructions &amp; key location</h3>
        <p className="sans" style={{ maxWidth: 560, color: "var(--muted)" }}>
          These are the instructions your trusted person receives if access is ever released.
          They are encrypted with a key unique to your household before they are stored. Never a
          password — only where things are and what to do.
        </p>
        <div className="sans" style={{ display: "grid", gap: 10, maxWidth: 560, marginTop: 10 }}>
          <label>
            Recovery instructions
            <textarea rows={3} value={recoveryPath} onChange={(e) => setRecoveryPath(e.target.value)}
              placeholder={record.recovery_path_enc ? "Saved (encrypted). Type to replace." : "e.g. Use the access key with a death certificate at iforgot.apple.com"} />
          </label>
          <label>
            Where the access key / kit is kept
            <input value={keyLocation} onChange={(e) => setKeyLocation(e.target.value)}
              placeholder={record.key_location_enc ? "Saved (encrypted). Type to replace." : "e.g. Sealed envelope in the home safe"} />
          </label>
          <button className="btn" onClick={saveFields} disabled={busy}>Save encrypted</button>
        </div>
        {(record.recovery_path_enc || record.key_location_enc) && (
          <div className="sans" style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {record.recovery_path_enc && (
              <div>
                <button className="btn secondary" onClick={() => reveal("recovery_path")}>Reveal instructions</button>{" "}
                {revealed.recovery_path && <span>{revealed.recovery_path}</span>}
              </div>
            )}
            {record.key_location_enc && (
              <div>
                <button className="btn secondary" onClick={() => reveal("key_location")}>Reveal key location</button>{" "}
                {revealed.key_location && <span>{revealed.key_location}</span>}
              </div>
            )}
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Every reveal is written to your activity log.</p>
          </div>
        )}
      </div>

      {msg && <p className="sans" style={{ marginBottom: 16 }}>{msg}</p>}

      <div className="sans" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {record.verified_state !== "revoked_or_invalid" && (
          <button
            className="btn secondary"
            onClick={async () => {
              await transition("revoked_or_invalid", "Marked revoked/invalid by owner");
              await load();
            }}
          >
            Mark as revoked / no longer valid
          </button>
        )}
      </div>

      <h2 style={{ fontSize: 20, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>History</h2>
      {transitions.length === 0 ? (
        <p className="sans">No history yet.</p>
      ) : (
        <ul className="sans" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          {transitions.map((t) => (
            <li key={t.id}>
              {new Date(t.created_at).toLocaleString()} — {t.from_state ? STATE_LABELS[t.from_state as VerifiedState] ?? t.from_state : "Created"} →{" "}
              {STATE_LABELS[t.to_state as VerifiedState] ?? t.to_state}
              {t.reason ? ` · ${t.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
