import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.png|logo-symbol.png|icon-192.png|icon-512.png|manifest.webmanifest|Family-Continuity-Checklist.pdf|api).*)",
  ],
};
