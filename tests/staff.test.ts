import { describe, expect, it } from "vitest";
import { can, isStaffRole, permissionsFor, STAFF_ROLES } from "@/lib/staff";

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
  it("makes compliance read-only", () => {
    expect(permissionsFor("compliance").sort()).toEqual(["accounts.view", "dashboard.view", "log.view"]);
  });
  it("gives nothing to someone with no role", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "accounts.view")).toBe(false);
    expect(isStaffRole("admin")).toBe(false);
    expect(isStaffRole("owner")).toBe(true);
  });
});
