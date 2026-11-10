// Continuity state engine — shared vocabulary (Stage 2a spec §4; patent spec §3, §6).

export const VERIFIED_STATES = [
  "not_started",
  "in_progress",
  "attested",
  "evidence_verified",
  "drift_suspected",
  "stale",
  "revoked_or_invalid",
] as const;
export type VerifiedState = (typeof VERIFIED_STATES)[number];

export const STATE_LABELS: Record<VerifiedState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  attested: "Attested",
  evidence_verified: "Verified",
  drift_suspected: "Drift suspected",
  stale: "Stale — re-check due",
  revoked_or_invalid: "Revoked / no longer valid",
};

export const STATE_FACTORS: Record<VerifiedState, number> = {
  evidence_verified: 1.0,
  attested: 0.6,
  drift_suspected: 0.4,
  in_progress: 0.3,
  stale: 0.3,
  not_started: 0,
  revoked_or_invalid: 0,
};

export const CRITICALITY_WEIGHTS: Record<string, number> = { high: 3, medium: 2, low: 1 };

export type ContinuityRecord = {
  id: string;
  household_id: string;
  item_id: string | null;
  provider_id: string;
  account_ref: string | null;
  designated_recipient: string | null;
  verified_state: VerifiedState;
  drift_state: string;
  evidence_type: string | null;
  evidence_hash: string | null;
  evidence_at: string | null;
  recheck_due: string | null;
  recovery_path_enc: string | null;
  key_location_enc: string | null;
  release_scope: string;
  criticality: string;
  created_at: string;
};

export function healthScore(records: Pick<ContinuityRecord, "verified_state" | "criticality">[]): number | null {
  if (records.length === 0) return null;
  let num = 0;
  let den = 0;
  for (const r of records) {
    const w = CRITICALITY_WEIGHTS[r.criticality] ?? 2;
    num += w * (STATE_FACTORS[r.verified_state] ?? 0);
    den += w;
  }
  return den === 0 ? null : Math.round((num / den) * 100);
}

/** Display state: a verified/attested record past its recheck date reads as stale. */
export function effectiveState(r: Pick<ContinuityRecord, "verified_state" | "recheck_due">): VerifiedState {
  if (
    (r.verified_state === "evidence_verified" || r.verified_state === "attested") &&
    r.recheck_due &&
    new Date(r.recheck_due).getTime() < Date.now()
  ) {
    return "stale";
  }
  return r.verified_state;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
