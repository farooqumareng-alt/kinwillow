import { staffGate } from "@/lib/admin";
import { can, isStaffRole, ROLE_INFO, STAFF_ROLES } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";
import StaffManager, { type StaffRow } from "@/components/StaffManager";

export const dynamic = "force-dynamic";

export default async function AdminStaff() {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  if (!can(ctx.role, "staff.manage")) return <AdminBlocked gate={{ status: "no_permission" }} />;

  const { data, error } = await ctx.service.from("profiles").select("*").not("staff_role", "is", null);
  const staff: StaffRow[] = ((data ?? []) as Array<{ user_id: string; email: string | null; display_name?: string | null; staff_role: string }>)
    .filter((p) => isStaffRole(p.staff_role))
    .map((p) => ({
      user_id: p.user_id,
      email: p.email,
      name: p.display_name ?? null,
      role: p.staff_role as StaffRow["role"],
      isYou: p.user_id === ctx.user.id,
    }))
    .sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));

  return (
    <main>
      <AdminHeader ctx={ctx} title="Staff" />
      {error ? (
        <div className="error sans" role="alert">
          Staff roles aren&rsquo;t set up in the database yet. Run the migration
          <code> 20261121000017_staff_roles.sql</code> in the Supabase SQL editor, then reload.
        </div>
      ) : (
        <StaffManager staff={staff} />
      )}
      <div className="panel sans" style={{ marginTop: 28 }}>
        <h3>What each role can do</h3>
        <ul style={{ paddingLeft: 18, fontSize: 15 }}>
          {STAFF_ROLES.map((r) => (
            <li key={r} style={{ padding: "3px 0" }}>
              <strong>{ROLE_INFO[r].label}:</strong> {ROLE_INFO[r].summary}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 10 }}>No role can read what is inside a customer&rsquo;s vault.</p>
      </div>
    </main>
  );
}
