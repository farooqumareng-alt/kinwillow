import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";
import RequestAccessForm from "@/components/RequestAccessForm";

export const dynamic = "force-dynamic";

export default async function RequestAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let contactName: string | null = null;
  let householdName: string | null = null;
  if (serviceConfigured()) {
    const service = createServiceClient();
    const { data: contact } = await service
      .from("trusted_contacts")
      .select("name, status, households ( name )")
      .eq("request_token", token)
      .single();
    if (contact && contact.status !== "removed") {
      contactName = contact.name as string;
      householdName = (contact as unknown as { households: { name: string } }).households?.name ?? null;
    }
  }

  return (
    <main className="narrow">
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
        Request recovery information
      </h1>
      {contactName ? (
        <>
          <p className="sans" style={{ color: "var(--muted)", marginBottom: 18 }}>
            For the {householdName ?? "household"} vault on KinWillow.
          </p>
          <RequestAccessForm token={token} contactName={contactName} />
        </>
      ) : (
        <p className="sans">
          This link is not valid or is no longer active. If you believe you should have access,
          please contact the account owner directly.
        </p>
      )}
    </main>
  );
}
