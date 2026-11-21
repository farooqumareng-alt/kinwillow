import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as runReminders } from "@/app/api/cron/reminders/route";
import { healthScore } from "@/lib/continuity";
import { agoPhrase, isDueForReview } from "@/lib/review";
import { FakeDb } from "./fake-supabase";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const DAY = 24 * 3600_000;

let db: FakeDb;
let sent: Array<{ to: string[]; subject: string; html: string }>;
let emailWorks: boolean;

const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const call = () =>
  runReminders(
    new Request("https://www.kinwillow.com/api/cron/reminders", { headers: { authorization: "Bearer cron-secret" } })
  ).then((r) => r.json());
const item = (id: string) => db.tables.inventory_items.find((r) => r.id === id)!;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => db,
  serviceConfigured: () => true,
}));

beforeEach(() => {
  db = new FakeDb();
  db.users[OWNER] = { email: "owner@example.com" };
  db.tables.households = [{ id: HOUSEHOLD, owner_id: OWNER, status: "active" }];
  db.tables.profiles = [{ user_id: OWNER, deletion_requested_at: null }];
  db.tables.inventory_items = [];
  db.tables.continuity_records = [];
  db.tables.provider_catalog = [{ id: "apple", name: "Apple" }];
  db.tables.documents = [];
  db.tables.subscriptions = [];
  db.tables.verified_sessions = [];
  sent = [];
  emailWorks = true;
  process.env.RESEND_API_KEY = "test";
  process.env.CRON_SECRET = "cron-secret";
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

function addItem(id: string, days: number, extra: Record<string, unknown> = {}) {
  db.tables.inventory_items.push({
    id,
    household_id: HOUSEHOLD,
    title: `Item <${id}>`,
    provider_name: null,
    renewal_date: dateIn(days),
    notice_days: null,
    renewal_reminder_stage: 0,
    archived: false,
    ...extra,
  });
}

describe("renewal reminders", () => {
  it("rejects callers without the secret", async () => {
    const res = await runReminders(new Request("https://www.kinwillow.com/api/cron/reminders"));
    expect(res.status).toBe(401);
  });

  it("sends an early notice once, then a 7-day notice once", async () => {
    addItem("insurance", 20);
    expect(await call()).toMatchObject({ reminder_emails: 1 });
    expect(item("insurance").renewal_reminder_stage).toBe(1);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    expect(sent[0].html).toContain("Item &lt;insurance&gt;");
    expect(await call()).toMatchObject({ reminder_emails: 0 });

    item("insurance").renewal_date = dateIn(5);
    expect(await call()).toMatchObject({ reminder_emails: 1 });
    expect(item("insurance").renewal_reminder_stage).toBe(2);
    expect(await call()).toMatchObject({ reminder_emails: 0 });
  });

  it("puts everything due for a household in one email", async () => {
    addItem("a", 3);
    addItem("b", 25);
    addItem("far", 200);
    addItem("archived", 3, { archived: true });
    expect(await call()).toMatchObject({ reminder_emails: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("2 dates");
    expect(item("far").renewal_reminder_stage).toBe(0);
    expect(item("archived").renewal_reminder_stage).toBe(0);
  });

  it("retries tomorrow when the email fails", async () => {
    addItem("domain", 10);
    emailWorks = false;
    expect(await call()).toMatchObject({ reminder_emails: 0, reminder_email_failures: 1 });
    expect(item("domain").renewal_reminder_stage).toBe(0);
    emailWorks = true;
    expect(await call()).toMatchObject({ reminder_emails: 1 });
  });

  it("reminds once about a legacy setting due for a re-check", async () => {
    db.tables.continuity_records.push({
      id: "rec-1",
      household_id: HOUSEHOLD,
      provider_id: "apple",
      account_ref: null,
      verified_state: "attested",
      recheck_due: dateIn(10),
      recheck_reminded_for: null,
    });
    expect(await call()).toMatchObject({ reminder_emails: 1 });
    expect(sent[0].html).toContain("Apple");
    expect(await call()).toMatchObject({ reminder_emails: 0 });
  });
});

describe("annual review", () => {
  const longAgo = new Date(Date.now() - 400 * DAY).toISOString();
  const recent = new Date(Date.now() - 20 * DAY).toISOString();
  const addReviewed = (id: string, reviewed_at: string) =>
    db.tables.inventory_items.push({
      id,
      household_id: HOUSEHOLD,
      title: id,
      renewal_date: null,
      renewal_reminder_stage: 0,
      archived: false,
      reviewed_at,
    });

  it("judges an item due after a year, and describes its age", () => {
    expect(isDueForReview(longAgo)).toBe(true);
    expect(isDueForReview(recent)).toBe(false);
    expect(isDueForReview(null)).toBe(true);
    expect(agoPhrase(longAgo)).toBe("over a year ago");
    expect(agoPhrase(recent)).toBe("20 days ago");
  });

  it("nudges once when items are a year unconfirmed, then waits three months", async () => {
    addReviewed("old-1", longAgo);
    addReviewed("old-2", longAgo);
    addReviewed("fresh", recent);
    expect(await call()).toMatchObject({ review_emails: 1 });
    expect(sent[0].html).toContain("2 items");
    expect(await call()).toMatchObject({ review_emails: 0 });

    db.tables.households[0].review_reminded_at = new Date(Date.now() - 100 * DAY).toISOString();
    expect(await call()).toMatchObject({ review_emails: 1 });
  });

  it("stays quiet when everything is current, and for a sealed vault", async () => {
    addReviewed("fresh", recent);
    expect(await call()).toMatchObject({ review_emails: 0 });
    addReviewed("old", longAgo);
    db.tables.households[0].status = "sealed";
    expect(await call()).toMatchObject({ review_emails: 0 });
  });
});

describe("account deletion", () => {
  it("leaves an account alone during the grace period", async () => {
    db.tables.profiles[0].deletion_requested_at = new Date(Date.now() - 29 * DAY).toISOString();
    expect(await call()).toMatchObject({ accounts_deleted: 0 });
    expect(db.tables.households).toHaveLength(1);
  });

  it("deletes files, the household and the sign-in once the grace period ends", async () => {
    db.tables.profiles[0].deletion_requested_at = new Date(Date.now() - 31 * DAY).toISOString();
    db.tables.documents.push({ id: "d1", household_id: HOUSEHOLD, storage_path: `${HOUSEHOLD}/d1-will.pdf` });
    expect(await call()).toMatchObject({ accounts_deleted: 1, deletion_failures: 0 });
    expect(db.removedFiles).toEqual([`${HOUSEHOLD}/d1-will.pdf`]);
    expect(db.tables.households).toHaveLength(0);
    expect(db.deletedUsers).toEqual([OWNER]);
  });

  it("stops, and reports, if billing cannot be cancelled", async () => {
    db.tables.profiles[0].deletion_requested_at = new Date(Date.now() - 31 * DAY).toISOString();
    db.tables.subscriptions.push({ household_id: HOUSEHOLD, stripe_subscription_id: "sub_1", status: "active" });
    delete process.env.STRIPE_SECRET_KEY;
    expect(await call()).toMatchObject({ accounts_deleted: 0, deletion_failures: 1 });
    expect(db.tables.households).toHaveLength(1);
    expect(db.deletedUsers).toEqual([]);
  });
});

describe("readiness score", () => {
  it("counts a record past its re-check date as stale", () => {
    const fresh = { verified_state: "evidence_verified" as const, criticality: "high", recheck_due: dateIn(30) };
    const overdue = { ...fresh, recheck_due: dateIn(-1) };
    expect(healthScore([fresh])).toBe(100);
    expect(healthScore([overdue])).toBe(30);
  });
});
