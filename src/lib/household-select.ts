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

// A user can belong to three kinds of vault: their own (they are its owner),
// their parents' (also owner), and vaults they were invited to help with
// (role "proxy" — a practitioner helping a client). A client's vault is also
// kind "own", so "mine" always means kind "own" AND role "owner".
const isMine = (r: MembershipRow) => r.households?.kind === "own" && r.role === "owner";

/** The preferred household if the user belongs to it, else their own, else the first. */
export function pickHousehold<T extends MembershipRow>(rows: T[], preferredId?: string | null): T | undefined {
  const valid = rows.filter((r) => r.households);
  return (
    (preferredId ? valid.find((r) => r.households!.id === preferredId) : undefined) ??
    valid.find(isMine) ??
    valid[0]
  );
}

/** The user's own household — the one that carries their plan and billing. Never a client's. */
export function ownHousehold<T extends MembershipRow>(rows: T[]): T | undefined {
  return rows.find(isMine);
}

/** How a vault relates to the signed-in user, for labels. */
export function relationLabel(row: { role: string; kind: HouseholdKind }): string {
  if (row.role !== "owner") return "helping";
  return row.kind === "parents" ? "parents" : "yours";
}

export const MEMBERSHIP_SELECT =
  "role, grant_level, households ( id, name, plan_tier, status, waiting_period_hours, kind )";
