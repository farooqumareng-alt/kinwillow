import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPackageContent, openPackageContent, sealPackageContent } from "@/lib/disclosure";
import { notifyOwner, releaseRequest, type DisclosureRequestRow } from "@/lib/release";
import { GET as runCron } from "@/app/api/cron/disclosure/route";
import { FakeDb } from "./fake-supabase";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SPOUSE = "contact-spouse";
const ADVISOR = "contact-advisor";
const FINANCIAL = "scope-financial";
const HOUR = 3600_000;

let db: FakeDb;
let sent: Array<{ to: string[]; subject: string; html: string }>;
let emailWorks: boolean;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const client = () => db as unknown as SupabaseClient;

function seed() {
  db = new FakeDb();
  db.users[OWNER] = { email: "owner@example.com" };
  db.tables.households = [{ id: HOUSEHOLD, owner_id: OWNER, name: "Test household" }];
  db.tables.trusted_contacts = [
    { id: SPOUSE, household_id: HOUSEHOLD, name: "Sam <b>Spouse</b>", email: "sam@example.com" },
    { id: ADVISOR, household_id: HOUSEHOLD, name: "Ada Advisor", email: "ada@example.com" },
  ];
  // The spouse holds the Financial scope; the advisor holds none.
  db.tables.contact_scopes = [{ contact_id: SPOUSE, scope_id: FINANCIAL }];
  db.tables.inventory_items = [
    { id: "item-will", household_id: HOUSEHOLD, category: "document", section: 3, title: "Will", location: "Fireproof box", criticality: "high", archived: false, release_scope_id: null },
    { id: "item-bank", household_id: HOUSEHOLD, category: "account", section: 4, title: "Checking", provider_name: "Chase", last4: "1234", criticality: "high", archived: false, release_scope_id: FINANCIAL },
    { id: "item-old", household_id: HOUSEHOLD, category: "other", section: 9, title: "Archived thing", criticality: "low", archived: true, release_scope_id: null },
  ];
  db.tables.documents = [
    { id: "doc-will", household_id: HOUSEHOLD, item_id: "item-will", file_name: "will.pdf", size_bytes: 2048 },
    { id: "doc-statement", household_id: HOUSEHOLD, item_id: "item-bank", file_name: "statement.pdf", size_bytes: 4096 },
  ];
  db.tables.continuity_records = [];
  db.tables.provider_catalog = [];
  db.tables.disclosure_requests = [];
  db.tables.disclosure_packages = [];
}

function addRequest(overrides: Partial<DisclosureRequestRow> = {}): DisclosureRequestRow {
  const row: DisclosureRequestRow = {
    id: `req-${db.tables.disclosure_requests.length + 1}`,
    household_id: HOUSEHOLD,
    trusted_contact_id: SPOUSE,
    request_class: "death",
    reason: "She passed on Tuesday <script>",
    state: "waiting",
    requested_at: iso(-8 * 24 * HOUR),
    release_at: iso(-1 * HOUR),
    owner_notified_at: iso(-8 * 24 * HOUR),
    owner_reminder_stage: 0,
    ...overrides,
  };
  db.tables.disclosure_requests.push(row as unknown as Record<string, unknown>);
  return row;
}

const requestRow = (id: string) => db.tables.disclosure_requests.find((r) => r.id === id)!;

beforeEach(() => {
  seed();
  sent = [];
  emailWorks = true;
  process.env.RESEND_API_KEY = "test";
  process.env.KINWILLOW_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.CRON_SECRET = "cron-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    if (emailWorks) sent.push(JSON.parse(init.body));
    return { ok: emailWorks, status: emailWorks ? 200 : 500 };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => db,
  serviceConfigured: () => true,
}));

describe("recovery package content", () => {
  it("includes the inventory and its documents, limited by the contact's scopes", async () => {
    const spouse = await buildPackageContent(client(), HOUSEHOLD, SPOUSE);
    expect(spouse.items.map((i) => i.title)).toEqual(["Will", "Checking"]);
    expect(spouse.items[1].documents.map((d) => d.file_name)).toEqual(["statement.pdf"]);
    expect(spouse.withheld_count).toBe(0);

    const advisor = await buildPackageContent(client(), HOUSEHOLD, ADVISOR);
    expect(advisor.items.map((i) => i.title)).toEqual(["Will"]);
    expect(advisor.withheld_count).toBe(1);
  });

  it("never includes archived items", async () => {
    const content = await buildPackageContent(client(), HOUSEHOLD, SPOUSE);
    expect(content.items.some((i) => i.title === "Archived thing")).toBe(false);
  });

  it("is stored encrypted and reads back intact", async () => {
    const content = await buildPackageContent(client(), HOUSEHOLD, SPOUSE);
    const stored = sealPackageContent(HOUSEHOLD, content);
    expect(Object.keys(stored)).toEqual(["enc"]);
    expect(JSON.stringify(stored)).not.toContain("Fireproof box");
    expect(openPackageContent(HOUSEHOLD, stored)).toEqual(content);
    expect(openPackageContent("33333333-3333-4333-8333-333333333333", stored)).toBeNull();
  });

  it("still reads packages stored before encryption was added", () => {
    const legacy = { entries: [{ provider: "Apple", mechanism: "", account_ref: null, treatment: "full" }] };
    expect(openPackageContent(HOUSEHOLD, legacy)?.entries).toHaveLength(1);
    expect(openPackageContent(HOUSEHOLD, legacy)?.items).toEqual([]);
  });
});

describe("owner notification", () => {
  it("emails the owner's sign-in address and escapes user-supplied text", async () => {
    const request = addRequest({ release_at: iso(48 * HOUR) });
    expect(await notifyOwner(client(), request, "initial")).toBe(true);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    expect(sent[0].html).toContain("Sam &lt;b&gt;Spouse&lt;/b&gt;");
    expect(sent[0].html).not.toContain("<script>");
  });

  it("reports failure when the email provider rejects the message", async () => {
    emailWorks = false;
    expect(await notifyOwner(client(), addRequest(), "initial")).toBe(false);
  });
});

describe("releasing a request", () => {
  it("releases a due request, stores one package and emails the contact", async () => {
    const request = addRequest();
    const result = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(result.ok).toBe(true);
    expect(requestRow(request.id).state).toBe("released");
    expect(db.tables.disclosure_packages).toHaveLength(1);
    expect(db.tables.disclosure_packages[0].contact_notified_at).toBeTruthy();
    expect(sent.at(-1)?.to).toEqual(["sam@example.com"]);
    expect(db.audit.at(-1)?.p_action).toBe("disclosure.package_auto_released");
  });

  it("refuses before the waiting period is over", async () => {
    const request = addRequest({ release_at: iso(HOUR) });
    const result = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(requestRow(request.id).state).toBe("waiting");
    expect(db.tables.disclosure_packages).toHaveLength(0);
  });

  it("refuses a vetoed request", async () => {
    const request = addRequest({ state: "vetoed" });
    const result = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(db.tables.disclosure_packages).toHaveLength(0);
  });

  it("will not auto-release when the owner was never notified, but the owner can release by hand", async () => {
    const request = addRequest({ owner_notified_at: null });
    const auto = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(auto).toMatchObject({ ok: false, status: 409 });
    const manual = await releaseRequest(client(), request.id, { actor: OWNER, requireOwnerNotified: false });
    expect(manual.ok).toBe(true);
  });

  it("releases only once when called twice", async () => {
    const request = addRequest();
    const opts = { actor: null, requireOwnerNotified: true };
    const [a, b] = await Promise.all([
      releaseRequest(client(), request.id, opts),
      releaseRequest(client(), request.id, opts),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(db.tables.disclosure_packages).toHaveLength(1);
  });

  it("returns the request to waiting if the package cannot be stored", async () => {
    const request = addRequest();
    db.failTables.add("insert:disclosure_packages");
    const result = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(requestRow(request.id).state).toBe("waiting");
    expect(requestRow(request.id).released_at).toBeNull();
  });

  it("keeps the release and leaves the contact email for retry if it fails to send", async () => {
    const request = addRequest();
    emailWorks = false;
    const result = await releaseRequest(client(), request.id, { actor: null, requireOwnerNotified: true });
    expect(result).toMatchObject({ ok: true, contact_notified: false });
    expect(db.tables.disclosure_packages[0].contact_notified_at ?? null).toBeNull();
  });
});

describe("scheduled job", () => {
  const call = (auth = "Bearer cron-secret") =>
    runCron(new Request("https://www.kinwillow.com/api/cron/disclosure", { headers: { authorization: auth } }));

  it("rejects callers without the secret", async () => {
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await runCron(new Request("https://www.kinwillow.com/api/cron/disclosure"))).status).toBe(401);
  });

  it("releases due requests and leaves the rest alone", async () => {
    const due = addRequest();
    const notDue = addRequest({ release_at: iso(5 * 24 * HOUR), requested_at: iso(-1 * HOUR) });
    const vetoed = addRequest({ state: "vetoed" });
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, released: 1 });
    expect(requestRow(due.id).state).toBe("released");
    expect(requestRow(notDue.id).state).toBe("waiting");
    expect(requestRow(vetoed.id).state).toBe("vetoed");
  });

  it("notifies an un-notified owner first and gives them at least 48 hours", async () => {
    const request = addRequest({ owner_notified_at: null });
    const body = await (await call()).json();
    expect(body).toMatchObject({ owner_notified: 1, released: 0 });
    const row = requestRow(request.id);
    expect(row.state).toBe("waiting");
    expect(row.owner_notified_at).toBeTruthy();
    expect(new Date(row.release_at as string).getTime()).toBeGreaterThan(Date.now() + 47 * HOUR);
    expect(sent[0].to).toEqual(["owner@example.com"]);
  });

  it("holds release while the owner cannot be notified", async () => {
    const request = addRequest({ owner_notified_at: null });
    emailWorks = false;
    const body = await (await call()).json();
    expect(body).toMatchObject({ owner_notify_failed: 1, released: 0 });
    expect(requestRow(request.id).state).toBe("waiting");
  });

  it("sends a midpoint reminder, then a final one, each only once", async () => {
    const request = addRequest({ requested_at: iso(-4 * 24 * HOUR), release_at: iso(3 * 24 * HOUR) });
    expect(await (await call()).json()).toMatchObject({ reminders_sent: 1 });
    expect(requestRow(request.id).owner_reminder_stage).toBe(1);
    expect(await (await call()).json()).toMatchObject({ reminders_sent: 0 });

    requestRow(request.id).release_at = iso(20 * HOUR);
    expect(await (await call()).json()).toMatchObject({ reminders_sent: 1 });
    expect(requestRow(request.id).owner_reminder_stage).toBe(2);
    expect(sent.at(-1)?.subject).toContain("Final notice");
    expect(await (await call()).json()).toMatchObject({ reminders_sent: 0 });
  });

  it("retries a package email that failed to send", async () => {
    const request = addRequest();
    emailWorks = false;
    await call();
    expect(requestRow(request.id).state).toBe("released");
    emailWorks = true;
    expect(await (await call()).json()).toMatchObject({ contact_emails_retried: 1 });
    expect(db.tables.disclosure_packages[0].contact_notified_at).toBeTruthy();
  });
});
