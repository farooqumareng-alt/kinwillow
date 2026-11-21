import { describe, expect, it } from "vitest";
import { ownHousehold, pickHousehold, relationLabel, type MembershipRow } from "@/lib/household-select";

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

  describe("a practitioner who also helps with client vaults", () => {
    // A client's vault is kind "own" too — it is the client's own.
    const client: MembershipRow = { ...row("client-1", "own"), role: "proxy", grant_level: "edit" };
    const mixed = [client, row("own-1", "own")];

    it("defaults to their own vault, never a client's", () => {
      expect(pickHousehold(mixed)?.households?.id).toBe("own-1");
    });

    it("can switch into a client's vault", () => {
      expect(pickHousehold(mixed, "client-1")?.households?.id).toBe("client-1");
    });

    it("never treats a client's vault as the one that carries their billing", () => {
      expect(ownHousehold(mixed)?.households?.id).toBe("own-1");
      expect(ownHousehold([client])).toBeUndefined();
    });

    it("labels each vault by how it relates to them", () => {
      expect(relationLabel({ role: "proxy", kind: "own" })).toBe("helping");
      expect(relationLabel({ role: "owner", kind: "parents" })).toBe("parents");
      expect(relationLabel({ role: "owner", kind: "own" })).toBe("yours");
    });
  });
});
