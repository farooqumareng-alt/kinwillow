import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";
import type { PackageEntry } from "@/lib/disclosure";

export const dynamic = "force-dynamic";

export default async function PackagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let entries: PackageEntry[] | null = null;
  let expired = false;
  let householdName: string | null = null;

  if (serviceConfigured()) {
    const service = createServiceClient();
    const { data: pkg } = await service
      .from("disclosure_packages")
      .select("*, households ( name )")
      .eq("access_token", token)
      .single();
    if (pkg) {
      if (new Date(pkg.expires_at).getTime() < Date.now()) {
        expired = true;
      } else {
        entries = (pkg.content as { entries: PackageEntry[] }).entries;
        householdName = (pkg as unknown as { households: { name: string } }).households?.name ?? null;
        await service
          .from("disclosure_packages")
          .update({
            access_count: (pkg.access_count ?? 0) + 1,
            first_accessed_at: pkg.first_accessed_at ?? new Date().toISOString(),
          })
          .eq("id", pkg.id);
        await service.rpc("append_audit", {
          p_household: pkg.household_id,
          p_actor: null,
          p_action: "disclosure.package_accessed",
          p_entity: "disclosure_package",
          p_entity_id: pkg.id,
        });
      }
    }
  }

  return (
    <main className="narrow">
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Recovery information
      </h1>
      {expired ? (
        <p className="sans">This link has expired. Please contact the household for a new one.</p>
      ) : entries ? (
        <>
          <p className="sans" style={{ color: "var(--muted)", marginBottom: 18 }}>
            Prepared by the {householdName ?? "household"} vault owner for their trusted contact.
            KinWillow never stored their passwords — this is the map to each provider&rsquo;s own
            recovery process.
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            {entries.map((e, i) => (
              <div key={i} className="panel sans">
                <h3>
                  {e.provider} — {e.mechanism}
                </h3>
                {e.account_ref && <p>Account: {e.account_ref}</p>}
                {e.annotation && <p style={{ color: "var(--muted)" }}>{e.annotation}</p>}
                {e.recovery_path && (
                  <p>
                    <strong>Recovery instructions:</strong> {e.recovery_path}
                  </p>
                )}
                {e.key_location && (
                  <p>
                    <strong>Where the access key is kept:</strong> {e.key_location}
                  </p>
                )}
                {e.setup_steps && (
                  <div>
                    <p>This was never set up. The steps would have been:</p>
                    <ol style={{ paddingLeft: 20 }}>
                      {e.setup_steps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="sans">This link is not valid.</p>
      )}
    </main>
  );
}
