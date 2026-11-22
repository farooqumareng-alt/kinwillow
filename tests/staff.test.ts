import { describe, expect, it } from "vitest";
import { can, isStaffRole, NEEDS_SECOND_PERSON, permissionsFor, rolesWith, STAFF_ROLES } from "@/lib/staff";

describe("staff roles", () => {
  it("lets only the owner manage staff", () => {
    for (const role of STAFF_ROLES) {
      expect(can(role, "staff.manage")).toBe(role === "owner");
    }
  });
  it("keeps money and support apart", () => {
    expect(can("support", "billing.manage")).toBe(false);
    expect(can("support", "accounts.support")).toBe(true);
    expect(can("billing", "accounts.support")).toBe(false);
    expect(can("billing", "billing.manage")).toBe(true);
    expect(can("partnerships", "billing.manage")).toBe(false);
    expect(can("partnerships", "partners.manage")).toBe(true);
  });
  it("lets compliance review emergency requests but change nothing else", () => {
    expect(permissionsFor("compliance").sort()).toEqual([
      "accounts.view",
      "dashboard.view",
      "log.view",
      "releases.manage",
      "releases.view",
    ]);
  });
  it("lets support watch emergency requests without acting on them", () => {
    expect(can("support", "releases.view")).toBe(true);
    expect(can("support", "releases.manage")).toBe(false);
  });
  it("requires a second person for role grants and cancelled releases", () => {
    expect(NEEDS_SECOND_PERSON).toEqual({ staff_set_role: "staff.manage", release_cancel: "releases.manage" });
    expect(rolesWith("staff.manage")).toEqual(["owner"]);
    expect(rolesWith("releases.manage")).toEqual(["owner", "compliance"]);
  });
  it("gives nothing to someone with no role", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "accounts.view")).toBe(false);
    expect(isStaffRole("admin")).toBe(false);
    expect(isStaffRole("owner")).toBe(true);
  });
});
