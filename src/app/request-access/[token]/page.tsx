import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";
import RequestAccessForm from "@/components/RequestAccessForm";

export const dynamic = "force-dynamic";

type LatestRequest = { state: string; requested_at: string; release_at: string } | null;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

export default async function RequestAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let contact: { id: string; name: string; status: string } | null = null;
  let householdName: string | null = null;
  let latest: LatestRequest = null;

  if (serviceConfigured()) {
    const service = createServiceClient();
    const { data } = await service
      .from("trusted_contacts")
      .select("id, name, status, households ( name )")
      .eq("request_token", token)
      .single();
    if (data && data.status !== "removed") {
      contact = { id: data.id as string, name: data.name as string, status: data.status as string };
      householdName = (data as unknown as { households: { name: string } }).households?.name ?? null;
      const { data: requests } = await service
        .from("disclosure_requests")
        .select("*")
        .eq("trusted_contact_id", contact.id)
        .order("requested_at", { ascending: false })
        .limit(1);
      latest = (requests?.[0] as LatestRequest) ?? null;
    }
  }

  if (!contact) {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 10 }}>
          This link is not active
        </h1>
        <p className="sans">
          It may have been replaced or removed by the account owner. If you believe you should have
          access, please contact them or their family directly.
        </p>
      </main>
    );
  }

  const vault = householdName ?? "this household";

  return (
    <main className="narrow">
      <h1 style={{ fontSize: 30, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Hello, {contact.name}
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 20 }}>
        You are a trusted contact for {vault} on KinWillow. This page is personal to you.
      </p>

      {latest?.state === "waiting" && (
        <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 20 }}>
          <strong>Your request is in its waiting period.</strong>
          <p style={{ marginTop: 6 }}>
            You asked for access on {when(latest.requested_at)}. The account owner has been told and
            can stop the request. If they don&rsquo;t, the information they prepared for you will be
            emailed to you automatically after <strong>{when(latest.release_at)}</strong> — usually
            within a day of that time. You don&rsquo;t need to do anything else.
          </p>
        </div>
      )}
      {latest?.state === "released" && (
        <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 20 }}>
          <strong>Your recovery information has been released.</strong>
          <p style={{ marginTop: 6 }}>
            We emailed you a private link to it. Please check your inbox and spam folder for
            &ldquo;Your KinWillow recovery package is ready&rdquo;. The link works for 30 days. If
            it has expired, you can make a new request below.
          </p>
        </div>
      )}
      {latest?.state === "vetoed" && (
        <div className="error sans" role="status" style={{ marginTop: 0, marginBottom: 20 }}>
          <strong>
            {(latest as { staff_cancelled_at?: string | null }).staff_cancelled_at
              ? "Your last request was stopped by KinWillow after a review."
              : "Your last request was stopped by the account owner."}
          </strong>
          <p style={{ marginTop: 6 }}>
            Nothing was released. If the situation has changed, you can make a new request below.
          </p>
        </div>
      )}

      <RequestAccessForm
        token={token}
        alreadyConfirmed={contact.status === "accepted"}
        requestInProgress={latest?.state === "waiting"}
        hasHistory={Boolean(latest)}
      />
    </main>
  );
}
