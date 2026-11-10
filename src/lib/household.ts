import { createClient } from "@/lib/supabase/client";

export interface HouseholdInfo {
  id: string;
  name: string;
  plan_tier: string;
  status: string;
  waiting_period_hours: number;
  role: string;
  grant_level: string;
}

// The signed-in user's first (own) household — MVP assumes one per user
// plus an optional parents' household on Family + Parents.
export async function getMyHousehold(): Promise<HouseholdInfo | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("household_members")
    .select("role, grant_level, households ( id, name, plan_tier, status, waiting_period_hours, kind )")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Array<{
    role: string;
    grant_level: string;
    households: HouseholdInfo & { kind: string };
  }>;
  const own = rows.find((r) => r.households?.kind === "own") ?? rows[0];
  if (!own) return null;
  return { ...own.households, role: own.role, grant_level: own.grant_level };
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
  archived: boolean;
  created_at: string;
}
