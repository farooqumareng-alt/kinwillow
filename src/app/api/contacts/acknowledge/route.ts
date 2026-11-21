import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Public: a trusted contact confirms they received and saved their personal
// link. It is a button press (POST), never a page view, so email scanners that
// open links cannot mark a contact as confirmed.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.request_token as string | undefined;
  if (!token || token.length < 20) return NextResponse.json({ error: "This link is not valid" }, { status: 400 });

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "This service is not configured yet" }, { status: 501 });
  }
  const { data: contact } = await service
    .from("trusted_contacts")
    .select("id, status")
    .eq("request_token", token)
    .single();
  if (!contact || contact.status === "removed") {
    return NextResponse.json({ error: "This link is not valid" }, { status: 404 });
  }
  if (contact.status !== "accepted") {
    const { error } = await service
      .from("trusted_contacts")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", contact.id);
    if (error) {
      console.error(`[contacts] could not record acknowledgement for ${contact.id}`, error.message);
      return NextResponse.json({ error: "Could not save that just now. Please try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
