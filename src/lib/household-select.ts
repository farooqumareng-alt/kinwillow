// Which household is the signed-in user looking at? Shared by browser and
// server code. A user has their own household and, on Family + Parents,
// optionally a second one for their parents. The choice is remembered in a
// cookie; it is only a preference — row-level security decides what can
// actually be read.
export const HOUSEHOLD_COOKIE = "kw_household";

export type HouseholdKind = "own" | "parents";

export interface HouseholdSummary {
  id: string;
  name: string;
  plan_tier: string;
  status: string;
  waiting_period_hours: number;
  kind: HouseholdKind;
}

export interface MembershipRow {
  role: string;
  grant_level: string;
  households: HouseholdSummary | null;
}

/** The preferred household if the user belongs to it, else their own, else the first. */
export function pickHousehold<T extends MembershipRow>(rows: T[], preferredId?: string | null): T | undefined {
  const valid = rows.filter((r) => r.households);
  return (
    (preferredId ? valid.find((r) => r.households!.id === preferredId) : undefined) ??
    valid.find((r) => r.households!.kind === "own") ??
    valid[0]
  );
}

/** The household that carries the plan and billing. */
export function ownHousehold<T extends MembershipRow>(rows: T[]): T | undefined {
  return rows.find((r) => r.households?.kind === "own") ?? rows.find((r) => r.households);
}

export const MEMBERSHIP_SELECT =
  "role, grant_level, households ( id, name, plan_tier, status, waiting_period_hours, kind )";
