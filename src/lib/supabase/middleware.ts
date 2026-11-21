import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SessionState } from "@/lib/session";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isApp = path === "/app" || path.startsWith("/app/");
  const isAuthPage = path === "/login" || path === "/signup";
  if (!isApp && !isAuthPage) return response;

  // A session is only complete once the emailed code — and the authenticator
  // app, when one is switched on — has been passed. The database enforces
  // this on every row; here we only route the browser to the right step.
  let state: SessionState = "none";
  if (user) {
    const { data, error } = await supabase.rpc("session_state");
    if (error) {
      console.error("[session] session_state() is unavailable — has migration 000008 been run?", error.message);
      state = "ok";
    } else {
      state = (data as SessionState) ?? "none";
    }
  }

  // Redirects must carry any refreshed auth cookies with them.
  const redirect = (pathname: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (isApp && state !== "ok") {
    return redirect("/login", { next: path, ...(state === "needs_mfa" ? { step: "mfa" } : {}) });
  }
  if (isAuthPage && state === "ok") {
    return redirect("/app");
  }
  return response;
}
