import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("household_members")
    .select("role, households ( name, plan_tier, status, waiting_period_hours )")
    .eq("user_id", user?.id ?? "");

  const first = memberships?.[0] as unknown as
    | { role: string; households: { name: string; plan_tier: string; status: string; waiting_period_hours: number } }
    | undefined;
  const household = first?.households;

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const mfaOn = (factors?.totp ?? []).some((f) => f.status === "verified");

  let itemCount = 0;
  let sectionsStarted = 0;
  let docCount = 0;
  if (household) {
    const { data: membershipRow } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user?.id ?? "")
      .limit(1)
      .single();
    const hid = membershipRow?.household_id as string | undefined;
    if (hid) {
      const { count } = await supabase
        .from("inventory_items")
        .select("id", { count: "exact", head: true })
        .eq("household_id", hid)
        .eq("archived", false);
      itemCount = count ?? 0;
      const { data: secs } = await supabase
        .from("inventory_items")
        .select("section")
        .eq("household_id", hid)
        .eq("archived", false)
        .not("section", "is", null);
      sectionsStarted = new Set((secs ?? []).map((r: { section: number }) => r.section)).size;
      const { count: dc } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", hid);
      docCount = dc ?? 0;
    }
  }

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        {household ? household.name : "Your vault"}
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 28 }}>
        Plan: {household?.plan_tier ?? "free"} · Status: {household?.status ?? "active"} · Emergency
        waiting period: {household ? Math.round(household.waiting_period_hours / 24) : 7} days
      </p>

      {!mfaOn && (
        <div className="error sans" style={{ marginBottom: 24 }}>
          Multi-factor authentication is not switched on yet. It&rsquo;s required before you can add
          trusted contacts or recovery instructions —{" "}
          <a href="/app/security">set it up now</a>.
        </div>
      )}

      <div className="grid">
        <div className="panel">
          <h3>Readiness score</h3>
          <div className="score">—</div>
          <p>
            Your score appears once you add accounts and verify their legacy settings in the
            Continuity Centre (Stage 2d).
          </p>
        </div>
        <div className="panel">
          <h3>Your vault</h3>
          <p>
            <strong>{itemCount}</strong> item{itemCount === 1 ? "" : "s"} · <strong>{docCount}</strong>{" "}
            document{docCount === 1 ? "" : "s"} · guided setup: <strong>{sectionsStarted} of 10</strong>{" "}
            sections started.
          </p>
          <p style={{ marginTop: 10 }}>
            <a href="/app/setup">Continue the guided setup →</a>
            <br />
            <a href="/app/inventory">Open your vault →</a>
          </p>
        </div>
        <div className="panel">
          <h3>Needs attention</h3>
          <p>
            Nothing needs attention. Drift and staleness alerts for your providers&rsquo; legacy
            settings will appear here (Stage 2d).
          </p>
        </div>
      </div>
    </main>
  );
}
