import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { openPackageContent } from "@/lib/disclosure";

export const dynamic = "force-dynamic";

// A trusted contact downloads one document from their released package.
// Allowed only while the package link is valid, and only for documents that
// were in the package snapshot. Redirects to a 60-second signed URL.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Not available" }, { status: 501 });
  }

  const { data: pkg } = await service
    .from("disclosure_packages")
    .select("id, household_id, content, expires_at")
    .eq("access_token", token)
    .single();
  if (!pkg || new Date(pkg.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link is not valid or has expired" }, { status: 404 });
  }
  const content = openPackageContent(pkg.household_id, pkg.content);
  const inPackage = content?.items.some((item) => item.documents.some((d) => d.id === docId));
  if (!inPackage) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: doc } = await service
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", docId)
    .eq("household_id", pkg.household_id)
    .single();
  if (!doc) {
    return NextResponse.json({ error: "This document is no longer in the vault" }, { status: 404 });
  }
  const { data: signed, error } = await service.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !signed?.signedUrl) {
    console.error(`[package] could not sign document ${doc.id}`, error?.message);
    return NextResponse.json({ error: "Could not open this document" }, { status: 500 });
  }

  await service.rpc("append_audit", {
    p_household: pkg.household_id,
    p_actor: null,
    p_action: "disclosure.document_downloaded",
    p_entity: "document",
    p_entity_id: doc.id,
  });

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
