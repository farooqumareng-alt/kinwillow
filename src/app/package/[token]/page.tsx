import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";
import { openPackageContent, type PackageContent, type PackageItem } from "@/lib/disclosure";
import { SECTIONS } from "@/lib/sections";

export const dynamic = "force-dynamic";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ItemCard({ item, token }: { item: PackageItem; token: string }) {
  const detail = [item.provider_name, item.account_type, item.last4 ? `ending ${item.last4}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="panel sans">
      <h3>{item.title}</h3>
      {detail && <p style={{ color: "var(--muted)" }}>{detail}</p>}
      {item.location && (
        <p>
          <strong>Where it is:</strong> {item.location}
        </p>
      )}
      {item.notes && <p style={{ whiteSpace: "pre-wrap" }}>{item.notes}</p>}
      {item.renewal_date && (
        <p>
          <strong>Renews or expires:</strong> {item.renewal_date}
        </p>
      )}
      {item.documents.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>Attached documents</strong>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            {item.documents.map((d) => (
              <li key={d.id}>
                <a href={`/package/${token}/doc/${d.id}`}>{d.file_name}</a>
                {d.size_bytes ? <span style={{ color: "var(--muted)" }}> ({formatSize(d.size_bytes)})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function PackagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let content: PackageContent | null = null;
  let expired = false;
  let expiresAt: string | null = null;
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
        content = openPackageContent(pkg.household_id, pkg.content);
        expiresAt = pkg.expires_at;
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

  const h2Style = { fontSize: 22, color: "var(--green-dark)", fontWeight: "normal", margin: "30px 0 6px" } as const;
  const wrap = { maxWidth: 760, margin: "0 auto", padding: "32px 16px 64px" } as const;

  if (expired || !content) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
          Recovery information
        </h1>
        <p className="sans">
          {expired
            ? "This link has expired. You can use your personal request link again to ask for a new package."
            : "This link is not valid."}
        </p>
      </main>
    );
  }

  // Group the inventory the way the owner filled it in: checklist order.
  const bySection = new Map<number, PackageItem[]>();
  const unsectioned: PackageItem[] = [];
  for (const item of content.items) {
    if (item.section == null) unsectioned.push(item);
    else bySection.set(item.section, [...(bySection.get(item.section) ?? []), item]);
  }
  const nothing = content.items.length === 0 && content.entries.length === 0;

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Recovery information
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 12 }}>
        Prepared by the owner of the {householdName ?? "household"} vault for their trusted contact.
        It tells you where things are and how each provider&rsquo;s own recovery process works.
        KinWillow never stored their passwords.
      </p>
      <div className="notice sans" style={{ marginBottom: 8 }}>
        <p>
          <strong>Before you act:</strong> this page gives you information, not legal authority. To
          close or take over an account, use the provider&rsquo;s official process — most will ask
          for a death certificate or proof that you are the executor or hold power of attorney.
          Please do not sign in as the owner.
        </p>
        {expiresAt && (
          <p style={{ marginTop: 6 }}>
            This link stops working on{" "}
            {new Date(expiresAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/New_York" })}.
            Print or save this page somewhere private before then.
          </p>
        )}
      </div>

      {nothing && (
        <p className="sans" style={{ marginTop: 20 }}>
          The owner had not yet added anything that is shared with you.
        </p>
      )}

      {SECTIONS.filter((s) => bySection.has(s.n)).map((s) => (
        <section key={s.n}>
          <h2 style={h2Style}>{s.title}</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {bySection.get(s.n)!.map((item) => (
              <ItemCard key={item.id} item={item} token={token} />
            ))}
          </div>
        </section>
      ))}
      {unsectioned.length > 0 && (
        <section>
          <h2 style={h2Style}>Other items</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {unsectioned.map((item) => (
              <ItemCard key={item.id} item={item} token={token} />
            ))}
          </div>
        </section>
      )}

      {content.entries.length > 0 && (
        <section>
          <h2 style={h2Style}>Account legacy settings</h2>
          <p className="sans" style={{ color: "var(--muted)", marginBottom: 12 }}>
            Each provider&rsquo;s own tool for passing an account on, and what the owner set up.
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            {content.entries.map((e, i) => (
              <div key={i} className="panel sans">
                <h3>
                  {e.provider}
                  {e.mechanism ? ` — ${e.mechanism}` : ""}
                </h3>
                {e.account_ref && <p>Account: {e.account_ref}</p>}
                {e.annotation && <p style={{ color: "var(--muted)" }}>{e.annotation}</p>}
                {e.recovery_path && (
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    <strong>Recovery instructions:</strong> {e.recovery_path}
                  </p>
                )}
                {e.key_location && (
                  <p style={{ whiteSpace: "pre-wrap" }}>
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
        </section>
      )}

      {content.withheld_count > 0 && (
        <p className="sans" style={{ color: "var(--muted)", marginTop: 26, fontSize: 14 }}>
          {content.withheld_count} {content.withheld_count === 1 ? "entry was" : "entries were"} not
          shared with you, by the owner&rsquo;s choice.
        </p>
      )}
    </main>
  );
}
