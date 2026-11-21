import { createClient } from "@/lib/supabase/client";
import {
  HOUSEHOLD_COOKIE,
  MEMBERSHIP_SELECT,
  ownHousehold,
  pickHousehold,
  type HouseholdSummary,
  type MembershipRow,
} from "@/lib/household-select";

export interface HouseholdInfo extends HouseholdSummary {
  role: string;
  grant_level: string;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Remember which household the user is working in (a preference, not a permission). */
export function setActiveHousehold(id: string) {
  document.cookie = `${HOUSEHOLD_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

const toInfo = (row: MembershipRow): HouseholdInfo => ({
  ...(row.households as HouseholdSummary),
  role: row.role,
  grant_level: row.grant_level,
});

/** Every household the signed-in user belongs to, their own first. */
export async function listMyHouseholds(): Promise<HouseholdInfo[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const rows = ((data ?? []) as unknown as MembershipRow[]).filter((r) => r.households);
  // Your own vault first, then your parents', then vaults you help with.
  const rank = (h: HouseholdInfo) => (h.role !== "owner" ? 2 : h.kind === "own" ? 0 : 1);
  return rows.map(toInfo).sort((a, b) => rank(a) - rank(b));
}

/**
 * The household the user is currently working in: the one they last switched
 * to, or their own. Every vault page reads and writes this household.
 */
export async function getMyHousehold(): Promise<HouseholdInfo | null> {
  const all = await listMyHouseholds();
  const rows = all.map((h) => ({ role: h.role, grant_level: h.grant_level, households: h }));
  const picked = pickHousehold(rows, readCookie(HOUSEHOLD_COOKIE));
  return picked ? toInfo(picked) : null;
}

/** The user's own household — the one that carries the plan and billing. */
export async function getOwnHousehold(): Promise<HouseholdInfo | null> {
  const all = await listMyHouseholds();
  const rows = all.map((h) => ({ role: h.role, grant_level: h.grant_level, households: h }));
  const own = ownHousehold(rows);
  return own ? toInfo(own) : null;
}

export interface InventoryItem {
  id: string;
  household_id: string;
  category: string;
  section: number | null;
  title: string;
  provider_name: string | null;
  location: string | null;
  last4: string | null;
  account_type: string | null;
  slot_key: string | null;
  notes: string | null;
  criticality: string;
  renewal_date: string | null;
  notice_days: number | null;
  release_scope_id: string | null;
  archived: boolean;
  created_at: string;
}
