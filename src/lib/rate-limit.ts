// Rate limiting for public endpoints, backed by Postgres (see migration
// …000014). Server-side only.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/** The caller's IP as reported by the hosting platform. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export type Limit = {
  /** What is being limited, e.g. "contact". */
  action: string;
  /** Who: an IP address, an email, a token. Stored only as a hash. */
  subject: string;
  /** Allowed hits per window. */
  limit: number;
  windowSeconds: number;
};

/**
 * Count one hit against each limit; false if any is exceeded.
 *
 * If the limiter itself is unavailable (migration not run, database error)
 * this allows the request and logs loudly: a broken limiter must not take
 * the contact form or sign-in down with it.
 */
export async function withinLimits(limits: Limit[]): Promise<boolean> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    console.error("[rate-limit] service role not configured; limits are not being applied");
    return true;
  }
  let allowed = true;
  for (const l of limits) {
    const { data, error } = await service.rpc("rate_limit_hit", {
      p_key: `${l.action}:${hash(l.subject)}`,
      p_limit: l.limit,
      p_window_seconds: l.windowSeconds,
    });
    if (error) {
      console.error(`[rate-limit] "${l.action}" is not being limited — has migration 000014 been run?`, error.message);
      continue;
    }
    if (data === false) allowed = false;
  }
  return allowed;
}

export function tooManyRequests(message = "Too many attempts. Please wait a few minutes and try again.") {
  return NextResponse.json({ ok: false, error: message }, { status: 429 });
}

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;
