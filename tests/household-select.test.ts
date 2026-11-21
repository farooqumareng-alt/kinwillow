import { describe, expect, it } from "vitest";
import { ownHousehold, pickHousehold, type MembershipRow } from "@/lib/household-select";

const row = (id: string, kind: "own" | "parents"): MembershipRow => ({
  role: "owner",
  grant_level: "edit",
  households: { id, name: id, plan_tier: "family_parents", status: "active", waiting_period_hours: 168, kind },
});

describe("choosing the active household", () => {
  const rows = [row("parents-1", "parents"), row("own-1", "own")];

  it("defaults to the user's own household, whatever the row order", () => {
    expect(pickHousehold(rows)?.households?.id).toBe("own-1");
    expect(pickHousehold(rows, null)?.households?.id).toBe("own-1");
  });

  it("uses the remembered household when the user belongs to it", () => {
    expect(pickHousehold(rows, "parents-1")?.households?.id).toBe("parents-1");
  });

  it("ignores a remembered household the user does not belong to", () => {
    expect(pickHousehold(rows, "someone-elses")?.households?.id).toBe("own-1");
  });

  it("copes with no households, and with a membership whose household is unreadable", () => {
    expect(pickHousehold([])).toBeUndefined();
    const unreadable: MembershipRow = { role: "owner", grant_level: "edit", households: null };
    expect(pickHousehold([unreadable, row("own-1", "own")], "x")?.households?.id).toBe("own-1");
  });

  it("billing always resolves to the own household", () => {
    expect(ownHousehold(rows)?.households?.id).toBe("own-1");
  });
});
