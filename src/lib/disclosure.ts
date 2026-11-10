// State-controlled disclosure (Stage 2a spec §5). Builds the per-contact
// recovery package content from a household's continuity records. Runs
// server-side only (it decrypts the field-encrypted payloads).
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptField } from "@/lib/crypto";
import { effectiveState, type ContinuityRecord } from "@/lib/continuity";

export type PackageEntry = {
  provider: string;
  mechanism: string;
  account_ref: string | null;
  treatment: "full" | "attested" | "stale_or_drift" | "not_set_up";
  annotation?: string;
  recovery_path?: string;
  key_location?: string;
  setup_steps?: string[];
};

export async function buildPackageContent(
  service: SupabaseClient,
  householdId: string,
  contactId: string
): Promise<{ entries: PackageEntry[]; withheld: number }> {
  const { data: scopeRows } = await service
    .from("contact_scopes")
    .select("scope_id")
    .eq("contact_id", contactId);
  const contactScopes = new Set((scopeRows ?? []).map((r: { scope_id: string }) => r.scope_id));

  const { data: records } = await service
    .from("continuity_records")
    .select("*")
    .eq("household_id", householdId);
  const { data: providers } = await service.from("provider_catalog").select("id, name, mechanism_type, walkthrough");
  const provById = new Map(
    (providers ?? []).map((p: { id: string; name: string; mechanism_type: string; walkthrough: string[] }) => [p.id, p])
  );

  const entries: PackageEntry[] = [];
  let withheld = 0;
  for (const rec of (records ?? []) as Array<ContinuityRecord & { release_scope_id: string | null }>) {
    // Scope intersection: scoped records go only to contacts holding that scope.
    if (rec.release_scope_id && !contactScopes.has(rec.release_scope_id)) {
      withheld++;
      continue;
    }
    const state = effectiveState(rec);
    if (state === "revoked_or_invalid") {
      withheld++;
      continue;
    }
    const prov = provById.get(rec.provider_id);
    const base = {
      provider: prov?.name ?? rec.provider_id,
      mechanism: prov?.mechanism_type ?? "",
      account_ref: rec.account_ref,
    };
    const tryDecrypt = (enc: string | null) => {
      if (!enc) return undefined;
      try {
        return decryptField(householdId, enc);
      } catch {
        return undefined;
      }
    };
    if (state === "evidence_verified") {
      entries.push({
        ...base,
        treatment: "full",
        recovery_path: tryDecrypt(rec.recovery_path_enc),
        key_location: rec.release_scope === "instructions_and_key_location" ? tryDecrypt(rec.key_location_enc) : undefined,
      });
    } else if (state === "attested") {
      entries.push({
        ...base,
        treatment: "attested",
        annotation: "Self-reported by the account owner; not independently verified.",
        recovery_path: tryDecrypt(rec.recovery_path_enc),
        key_location: rec.release_scope === "instructions_and_key_location" ? tryDecrypt(rec.key_location_enc) : undefined,
      });
    } else if (state === "stale" || state === "drift_suspected") {
      entries.push({
        ...base,
        treatment: "stale_or_drift",
        annotation:
          state === "stale"
            ? "This setup passed its re-check date; treat the instructions as possibly out of date."
            : "Something about this setup may have changed; treat the instructions with care.",
        recovery_path: tryDecrypt(rec.recovery_path_enc),
        key_location: rec.release_scope === "instructions_and_key_location" ? tryDecrypt(rec.key_location_enc) : undefined,
      });
    } else {
      entries.push({
        ...base,
        treatment: "not_set_up",
        annotation: "The provider's legacy setting was never completed for this account.",
        setup_steps: prov?.walkthrough,
      });
    }
  }
  return { entries, withheld };
}
