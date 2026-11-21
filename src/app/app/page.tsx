import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { HOUSEHOLD_COOKIE, MEMBERSHIP_SELECT, pickHousehold, type MembershipRow } from "@/lib/household-select";
import { healthScore, effectiveState, type VerifiedState } from "@/lib/continuity";
import { reviewCutoff } from "@/lib/review";

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  family: "Family",
  family_parents: "Family + Parents",
};
const FIRST_ITEMS_GOAL = 10;

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: true });

  // Same choice as getMyHousehold(): the vault the user last switched to,
  // otherwise their own.
  const rows = (memberships ?? []) as unknown as MembershipRow[];
  const preferred = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  const membership = pickHousehold(rows, preferred);
  const household = membership?.households ?? undefined;
  const helping = Boolean(membership && membership.role !== "owner");
  const hid = household?.id;

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const mfaOn = (factors?.totp ?? []).some((f) => f.status === "verified");

  let itemCount = 0;
  let sectionsStarted = 0;
  let docCount = 0;
  let contactCount = 0;
  let contactsTold = 0;
  let recordCount = 0;
  let readinessScore: number | null = null;
  let attentionCount = 0;
  let upcoming: Array<{ id: string; title: string; renewal_date: string }> = [];
  let reviewDue = 0;
  if (hid) {
    const today = new Date().toISOString().slice(0, 10);
    const in60 = new Date(Date.now() + 60 * 24 * 3600_000).toISOString().slice(0, 10);
    const [items, docs, contacts, recs, renewals] = await Promise.all([
      supabase.from("inventory_items").select("section").eq("household_id", hid).eq("archived", false),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("household_id", hid),
      supabase.from("trusted_contacts").select("status, invited_at").eq("household_id", hid).neq("status", "removed"),
      supabase.from("continuity_records").select("verified_state, criticality, recheck_due").eq("household_id", hid),
      supabase
        .from("inventory_items")
        .select("id, title, renewal_date")
        .eq("household_id", hid)
        .eq("archived", false)
        .gte("renewal_date", today)
        .lte("renewal_date", in60)
        .order("renewal_date", { ascending: true })
        .limit(5),
    ]);
    // Counted separately: the column arrives with migration 000015, and a
    // missing column must not blank the rest of the dashboard.
    const stale = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", hid)
      .eq("archived", false)
      .lt("reviewed_at", reviewCutoff().toISOString());
    reviewDue = stale.error ? 0 : stale.count ?? 0;
    const itemRows = (items.data ?? []) as Array<{ section: number | null }>;
    itemCount = itemRows.length;
    sectionsStarted = new Set(itemRows.map((r) => r.section).filter((s) => s != null)).size;
    docCount = docs.count ?? 0;
    const contactRows = (contacts.data ?? []) as Array<{ status: string; invited_at: string | null }>;
    contactCount = contactRows.length;
    contactsTold = contactRows.filter((c) => c.status === "accepted" || c.invited_at).length;
    upcoming = (renewals.data ?? []) as typeof upcoming;
    const typed = (recs.data ?? []) as unknown as Array<{
      verified_state: VerifiedState;
      criticality: string;
      recheck_due: string | null;
    }>;
    recordCount = typed.length;
    readinessScore = healthScore(typed);
    attentionCount = typed.filter((r) => {
      const s = effectiveState(r);
      return s === "stale" || s === "drift_suspected" || s === "not_started";
    }).length;
  }

  // The path from an empty vault to one a family could actually use.
  const steps = [
    {
      done: itemCount >= FIRST_ITEMS_GOAL,
      label: `Add your first ${FIRST_ITEMS_GOAL} items`,
      detail:
        itemCount >= FIRST_ITEMS_GOAL
          ? `${itemCount} items so far.`
          : `${itemCount} of ${FIRST_ITEMS_GOAL} — the guided setup walks you through it, one question at a time.`,
      href: "/app/setup",
      cta: itemCount === 0 ? "Start the guided setup" : "Continue the guided setup",
    },
    {
      done: contactCount > 0,
      label: "Name a trusted contact",
      detail: "The person your family would turn to. Until you name someone, nobody can reach any of this.",
      href: "/app/contacts",
      cta: "Add a contact",
    },
    {
      done: contactCount > 0 && contactsTold === contactCount,
      label: "Make sure they have their link",
      detail: "We email it with a plain explanation. A contact who doesn't know about the vault can't use it.",
      href: "/app/contacts",
      cta: "Email their link",
    },
    {
      done: recordCount > 0,
      label: "Switch on one legacy setting",
      detail: "Apple, Google and Facebook each have their own tool for passing an account on. We walk you through it.",
      href: "/app/continuity",
      cta: "Open the Continuity Centre",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>{household ? household.name : "Your vault"}</h1>
      <p className="sans muted" style={{ marginBottom: 24 }}>
        {helping ? "You are helping with this vault · " : household?.kind === "parents" ? "Your parents’ vault · " : ""}
        Plan: {PLAN_NAMES[household?.plan_tier ?? "free"] ?? household?.plan_tier}
        {household?.status === "sealed" ? " · Sealed (read-only)" : ""} · Emergency waiting period:{" "}
        {household ? Math.round(household.waiting_period_hours / 24) : 7} days
      </p>

      {nextStep && (
        <div className="panel sans" style={{ marginBottom: 24 }}>
          <h3>
            Getting your vault ready — {doneCount} of {steps.length} done
          </h3>
          <ol className="steps-list" style={{ marginTop: 12 }}>
            {steps.map((s) => (
              <li key={s.label} className={s.done ? "done" : undefined}>
                <span className="mark" aria-hidden="true">{s.done ? "✓" : ""}</span>
                <span>
                  <span className="label">
                    <span className="visually-hidden">{s.done ? "Done: " : "To do: "}</span>
                    <strong>{s.label}</strong>
                  </span>
                  {!s.done && <span className="muted" style={{ display: "block", fontSize: 14 }}>{s.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
          <Link className="btn" href={nextStep.href} style={{ marginTop: 16 }}>
            {nextStep.cta}
          </Link>
        </div>
      )}

      {reviewDue > 0 && (
        <div className="notice sans" style={{ marginTop: 0, marginBottom: 24 }}>
          <strong>
            {reviewDue} item{reviewDue === 1 ? " hasn’t" : "s haven’t"} been confirmed in over a year.
          </strong>{" "}
          A quick look keeps your vault true. <Link href="/app/review">Start the annual review</Link>
        </div>
      )}

      {!nextStep && !mfaOn && (
        <div className="notice sans" style={{ marginTop: 0, marginBottom: 24 }}>
          Your sign-in is protected by your password and an emailed code. For a stronger second
          step, <Link href="/app/security">add an authenticator app</Link>.
        </div>
      )}

      <div className="grid">
        <div className="panel">
          <h3>Your vault</h3>
          <p>
            <strong>{itemCount}</strong> item{itemCount === 1 ? "" : "s"} · <strong>{docCount}</strong>{" "}
            document{docCount === 1 ? "" : "s"} · guided setup: <strong>{sectionsStarted} of 10</strong>{" "}
            sections started.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/app/setup">Continue the guided setup →</Link>
            <br />
            <Link href="/app/inventory">Open your vault →</Link>
          </p>
        </div>
        <div className="panel">
          <h3>Coming up</h3>
          {upcoming.length === 0 ? (
            <p>
              No renewal or expiry dates in the next 60 days. Add a date to any item and we&rsquo;ll
              email you before it arrives.
            </p>
          ) : (
            <ul style={{ listStyle: "none", fontSize: 15 }}>
              {upcoming.map((u) => (
                <li key={u.id} style={{ padding: "3px 0" }}>
                  <Link href={`/app/inventory/${u.id}`}>{u.title}</Link>{" "}
                  <span className="muted">
                    —{" "}
                    {new Date(`${u.renewal_date}T00:00:00Z`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h3>Legacy settings</h3>
          <div className="score">{readinessScore === null ? "—" : `${readinessScore}%`}</div>
          <p>
            {readinessScore === null
              ? "Your readiness score appears once you start a legacy check."
              : attentionCount === 0
                ? "Every legacy setting you track is confirmed and current."
                : `${attentionCount} need${attentionCount === 1 ? "s" : ""} attention — not started, or due a re-check.`}{" "}
            <Link href="/app/continuity">Open the Continuity Centre →</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
