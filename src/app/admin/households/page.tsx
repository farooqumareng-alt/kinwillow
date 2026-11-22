import { staffGate } from "@/lib/admin";
import { can } from "@/lib/staff";
import { AdminBlocked, AdminHeader } from "@/components/AdminShell";
import HouseholdActions, { type HouseholdRow } from "@/components/HouseholdActions";

export const dynamic = "force-dynamic";

export default async function AdminHouseholds() {
  const ctx = await staffGate();
  if (ctx.status !== "ok") return <AdminBlocked gate={ctx} />;
  if (!can(ctx.role, "accounts.view")) return <AdminBlocked gate={{ status: "no_permission" }} />;
  const { service } = ctx;
  const { data: households } = await service
    .from("households")
    .select("id, name, plan_tier, status, waiting_period_hours, owner_id, created_at")
    .order("created_at", { ascending: false });
  const { data: members } = await service.from("household_members").select("household_id");
  // "*" so this page still loads before the partner columns exist.
  const { data: profiles } = await service.from("profiles").select("*");
  type ProfileRow = { user_id: string; email: string; is_partner?: boolean; partner_code?: string | null };
  const profileByUser = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p]));
  const memberCounts = new Map<string, number>();
  for (const m of (members ?? []) as Array<{ household_id: string }>) {
    memberCounts.set(m.household_id, (memberCounts.get(m.household_id) ?? 0) + 1);
  }
  const rows: HouseholdRow[] = ((households ?? []) as Array<{
    id: string; name: string; plan_tier: string; status: string; waiting_period_hours: number; owner_id: string; created_at: string;
  }>).map((h) => ({
    ...h,
    owner_email: profileByUser.get(h.owner_id)?.email ?? null,
    owner_is_partner: Boolean(profileByUser.get(h.owner_id)?.is_partner),
    owner_partner_code: profileByUser.get(h.owner_id)?.partner_code ?? null,
    members: memberCounts.get(h.id) ?? 0,
  }));

  return (
    <main>
      <AdminHeader ctx={ctx} title="Households" />
      <HouseholdActions rows={rows} canBilling={can(ctx.role, "billing.manage")} canPartners={can(ctx.role, "partners.manage")} />
    </main>
  );
}
