// Staff roles and what each may do in the admin panel. Pure data, so it can
// be used on the server, in the browser and in tests.
//
// The rule behind every role: staff run the business from account metadata.
// No role, including owner, can read what is inside a vault.

export const STAFF_ROLES = ["owner", "support", "billing", "partnerships", "compliance"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Permission =
  | "dashboard.view"
  | "accounts.view" // look up an account and see its plan, status and timeline
  | "accounts.support" // send a password-reset or confirmation email
  | "billing.manage" // change a plan, seal or unseal a household
  | "partners.manage" // grant or remove partner status
  | "inbox.manage" // read and file contact messages
  | "releases.view" // see emergency requests in their waiting period
  | "releases.manage" // put a request on hold, lift a hold, ask to cancel one
  | "log.view" // read the staff log
  | "staff.manage"; // add, change and remove staff

const ALL: Permission[] = [
  "dashboard.view",
  "accounts.view",
  "accounts.support",
  "billing.manage",
  "partners.manage",
  "inbox.manage",
  "releases.view",
  "releases.manage",
  "log.view",
  "staff.manage",
];

const GRANTS: Record<StaffRole, Permission[]> = {
  owner: ALL,
  support: ["dashboard.view", "accounts.view", "accounts.support", "inbox.manage", "releases.view"],
  billing: ["dashboard.view", "accounts.view", "billing.manage"],
  partnerships: ["dashboard.view", "accounts.view", "partners.manage", "inbox.manage"],
  compliance: ["dashboard.view", "accounts.view", "log.view", "releases.view", "releases.manage"],
};

export const ROLE_INFO: Record<StaffRole, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, including adding and removing staff." },
  support: {
    label: "Support",
    summary: "Look up accounts, send reset and confirmation emails, handle the inbox, watch emergency requests.",
  },
  billing: { label: "Billing", summary: "Look up accounts, change plans, seal and unseal households." },
  partnerships: { label: "Partnerships", summary: "Look up accounts, grant partner status, handle the inbox." },
  compliance: {
    label: "Compliance",
    summary: "Look up accounts, read the staff log, and review emergency requests (hold, or ask to cancel).",
  },
};

/**
 * Actions that take two people: one staff member asks, and a different one
 * who holds the same permission approves. The value is that permission.
 */
export const NEEDS_SECOND_PERSON: Record<string, Permission> = {
  staff_set_role: "staff.manage",
  release_cancel: "releases.manage",
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  return role ? GRANTS[role].includes(permission) : false;
}

export function permissionsFor(role: StaffRole): Permission[] {
  return [...GRANTS[role]];
}

/** The roles that hold a permission. */
export function rolesWith(permission: Permission): StaffRole[] {
  return STAFF_ROLES.filter((r) => GRANTS[r].includes(permission));
}
