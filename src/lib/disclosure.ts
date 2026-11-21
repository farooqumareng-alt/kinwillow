// State-controlled disclosure (Stage 2a spec §5). Builds the per-contact
// recovery package from a household's vault: the inventory the owner built
// (where things are, and instructions) plus the continuity records (each
// provider's own legacy setting). Runs server-side only — it decrypts the
// field-encrypted payloads.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptField, encryptField, encryptionConfigured } from "@/lib/crypto";
import { effectiveState, type ContinuityRecord } from "@/lib/continuity";

export type PackageEntry = {
  provider: string;
  mechanism: string;
  account_ref: string | null;
  treatment: "full" | "attested" | "stale_or_drift" | "in_progress" | "not_set_up";
  annotation?: string;
  recovery_path?: string;
  key_location?: string;
  setup_steps?: string[];
};

export type PackageDocument = { id: string; file_name: string; size_bytes: number | null };

export type PackageItem = {
  id: string;
  category: string;
  section: number | null;
  title: string;
  provider_name: string | null;
  account_type: string | null;
  last4: string | null;
  location: string | null;
  notes: string | null;
  criticality: string;
  renewal_date: string | null;
  documents: PackageDocument[];
};

export type PackageContent = {
  entries: PackageEntry[];
  items: PackageItem[];
  withheld_count: number;
  generated_at: string;
};

export async function buildPackageContent(
  service: SupabaseClient,
  householdId: string,
  contactId: string
): Promise<PackageContent> {
  const { data: scopeRows } = await service
    .from("contact_scopes")
    .select("scope_id")
    .eq("contact_id", contactId);
  const contactScopes = new Set((scopeRows ?? []).map((r: { scope_id: string }) => r.scope_id));
  // Scope intersection: a scoped record goes only to contacts holding that
  // scope; an unscoped record goes to every contact.
  const inScope = (scopeId: string | null | undefined) => !scopeId || contactScopes.has(scopeId);

  let withheld = 0;

  // ----- the inventory: the map the owner built -----
  const { data: itemRows, error: itemsError } = await service
    .from("inventory_items")
    .select("*")
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("section", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (itemsError) throw new Error(`Could not read the vault inventory: ${itemsError.message}`);

  const { data: docRows, error: docsError } = await service
    .from("documents")
    .select("id, item_id, file_name, size_bytes")
    .eq("household_id", householdId);
  if (docsError) throw new Error(`Could not read the vault documents: ${docsError.message}`);
  const docsByItem = new Map<string, PackageDocument[]>();
  for (const d of (docRows ?? []) as Array<PackageDocument & { item_id: string | null }>) {
    if (!d.item_id) continue;
    const list = docsByItem.get(d.item_id) ?? [];
    list.push({ id: d.id, file_name: d.file_name, size_bytes: d.size_bytes });
    docsByItem.set(d.item_id, list);
  }

  const items: PackageItem[] = [];
  for (const it of (itemRows ?? []) as Array<Omit<PackageItem, "documents"> & { release_scope_id?: string | null }>) {
    if (!inScope(it.release_scope_id)) {
      withheld++;
      continue;
    }
    items.push({
      id: it.id,
      category: it.category,
      section: it.section,
      title: it.title,
      provider_name: it.provider_name ?? null,
      account_type: it.account_type ?? null,
      last4: it.last4 ?? null,
      location: it.location ?? null,
      notes: it.notes ?? null,
      criticality: it.criticality,
      renewal_date: it.renewal_date ?? null,
      documents: docsByItem.get(it.id) ?? [],
    });
  }

  // ----- continuity records: each provider's own legacy setting -----
  const { data: records, error: recordsError } = await service
    .from("continuity_records")
    .select("*")
    .eq("household_id", householdId);
  if (recordsError) throw new Error(`Could not read the continuity records: ${recordsError.message}`);
  const { data: providers } = await service.from("provider_catalog").select("id, name, mechanism_type, walkthrough");
  const provById = new Map(
    (providers ?? []).map((p: { id: string; name: string; mechanism_type: string; walkthrough: string[] }) => [p.id, p])
  );

  const tryDecrypt = (enc: string | null) => {
    if (!enc) return undefined;
    try {
      return decryptField(householdId, enc);
    } catch {
      return undefined;
    }
  };

  const entries: PackageEntry[] = [];
  for (const rec of (records ?? []) as Array<ContinuityRecord & { release_scope_id: string | null }>) {
    if (!inScope(rec.release_scope_id)) {
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
    const instructions = {
      recovery_path: tryDecrypt(rec.recovery_path_enc),
      key_location:
        rec.release_scope === "instructions_and_key_location" ? tryDecrypt(rec.key_location_enc) : undefined,
    };
    if (state === "evidence_verified") {
      entries.push({ ...base, treatment: "full", ...instructions });
    } else if (state === "attested") {
      entries.push({
        ...base,
        treatment: "attested",
        annotation: "Self-reported by the account owner; not independently verified.",
        ...instructions,
      });
    } else if (state === "stale" || state === "drift_suspected") {
      entries.push({
        ...base,
        treatment: "stale_or_drift",
        annotation:
          state === "stale"
            ? "This setup passed its re-check date; treat the instructions as possibly out of date."
            : "Something about this setup may have changed; treat the instructions with care.",
        ...instructions,
      });
    } else if (state === "in_progress" && (instructions.recovery_path || instructions.key_location)) {
      entries.push({
        ...base,
        treatment: "in_progress",
        annotation:
          "The owner started this setup but never confirmed it was finished; the provider's legacy setting may not be switched on.",
        ...instructions,
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

  return { entries, items, withheld_count: withheld, generated_at: new Date().toISOString() };
}

// ----- storage format -----
// A released package is a snapshot. It is stored encrypted with the
// household key ({ enc: "v1...." }) so a database read alone does not expose
// it. Packages written before this change are plain { entries, ... } JSON.

export function sealPackageContent(householdId: string, content: PackageContent): Record<string, unknown> {
  if (!encryptionConfigured()) {
    console.error("[disclosure] KINWILLOW_MASTER_KEY is not set; storing package content unencrypted");
    return content as unknown as Record<string, unknown>;
  }
  return { enc: encryptField(householdId, JSON.stringify(content)) };
}

export function openPackageContent(householdId: string, stored: unknown): PackageContent | null {
  if (!stored || typeof stored !== "object") return null;
  let raw = stored as Record<string, unknown>;
  if (typeof raw.enc === "string") {
    try {
      raw = JSON.parse(decryptField(householdId, raw.enc));
    } catch (err) {
      console.error("[disclosure] could not decrypt package content", err);
      return null;
    }
  }
  return {
    entries: (raw.entries as PackageEntry[] | undefined) ?? [],
    items: (raw.items as PackageItem[] | undefined) ?? [],
    withheld_count: (raw.withheld_count as number | undefined) ?? 0,
    generated_at: (raw.generated_at as string | undefined) ?? "",
  };
}
