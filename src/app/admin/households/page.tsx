import { requireAdmin } from "@/lib/admin";
import HouseholdActions, { type HouseholdRow } from "@/components/HouseholdActions";

export const dynamic = "force-dynamic";

export default async function AdminHouseholds() {
  const ctx = await requireAdmin();
  if (!ctx) {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>Not available</h1>
      </main>
    );
  }
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
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Users &amp; households
      </h1>
      <nav className="app-nav sans" style={{ marginBottom: 24 }}>
        <a href="/admin">Overview</a>
        <a href="/admin/households">Users & households</a>
        <a href="/admin/inbox">Inbox</a>
      </nav>
      <HouseholdActions rows={rows} />
    </main>
  );
}
