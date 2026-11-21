import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionState } from "@/lib/session";
import { siteUrl } from "@/lib/email";

// A partner's own numbers: their referral link, how many accounts signed up
// through it and how many of those are on a paid plan. Counts only — a
// partner never learns who signed up unless that client invites them in.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await getSessionState(supabase)) !== "ok") {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_partner, partner_code")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_partner || !profile.partner_code) {
    return NextResponse.json({ is_partner: false });
  }

  const service = createServiceClient();
  const { data: referred } = await service.from("profiles").select("user_id").eq("referred_by", user.id);
  const ids = ((referred ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  let paid = 0;
  if (ids.length > 0) {
    const { count } = await service
      .from("households")
      .select("id", { count: "exact", head: true })
      .in("owner_id", ids)
      .eq("kind", "own")
      .neq("plan_tier", "free");
    paid = count ?? 0;
  }
  return NextResponse.json({
    is_partner: true,
    code: profile.partner_code,
    link: `${siteUrl()}/signup?partner=${encodeURIComponent(profile.partner_code)}`,
    referred_total: ids.length,
    referred_paid: paid,
    discount_active: Boolean(process.env.STRIPE_PARTNER_COUPON),
  });
}
