import { requireAdmin } from "@/lib/admin";
import InboxList, { type InboxItem } from "@/components/InboxList";

export const dynamic = "force-dynamic";

export default async function AdminInbox() {
  const ctx = await requireAdmin();
  if (!ctx) {
    return (
      <main className="narrow">
        <h1 style={{ fontSize: 28, color: "var(--green-dark)", fontWeight: "normal" }}>Not available</h1>
      </main>
    );
  }
  const { service } = ctx;
  const { data: messages } = await service
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: signups } = await service
    .from("signups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const items: InboxItem[] = [
    ...((messages ?? []) as Array<Record<string, unknown>>).map((m) => ({
      id: m.id as string,
      kind: "messages" as const,
      title: `${(m.name as string) ?? "Someone"} (${(m.email as string) ?? ""}) — ${(m.topic as string) ?? ""}`,
      detail: (m.message as string) ?? "",
      created_at: m.created_at as string,
      read_at: (m.read_at as string) ?? null,
      archived_at: (m.archived_at as string) ?? null,
    })),
    ...((signups ?? []) as Array<Record<string, unknown>>).map((s) => ({
      id: s.id as string,
      kind: "signups" as const,
      title: (s.email as string) ?? "",
      detail: "Requested the free Family Continuity Checklist.",
      created_at: s.created_at as string,
      read_at: (s.read_at as string) ?? null,
      archived_at: (s.archived_at as string) ?? null,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Inbox
      </h1>
      <nav className="app-nav sans" style={{ marginBottom: 24 }}>
        <a href="/admin">Overview</a>
        <a href="/admin/households">Users & households</a>
        <a href="/admin/inbox">Inbox</a>
      </nav>
      <InboxList items={items} />
    </main>
  );
}
