"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMyHousehold } from "@/lib/household";

// Mounted once in the vault layout. Does two things:
//   1. signs the browser out after 30 minutes without activity (shared
//      across tabs, so working in one tab keeps the others alive);
//   2. shows a banner when the household is sealed (read-only).
const IDLE_MINUTES = 30;
const KEY = "kw-last-activity";

export default function AppSessionGuard() {
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    getMyHousehold()
      .then((h) => setSealed(h?.status === "sealed"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const limit = IDLE_MINUTES * 60_000;
    let last = Date.now();
    const read = () => {
      try {
        return Math.max(last, Number(localStorage.getItem(KEY)) || 0);
      } catch {
        return last;
      }
    };
    let lastWrite = 0;
    const touch = () => {
      last = Date.now();
      // Throttle storage writes; pointer moves fire constantly.
      if (last - lastWrite < 15_000) return;
      lastWrite = last;
      try {
        localStorage.setItem(KEY, String(last));
      } catch {
        /* storage unavailable: this tab still tracks its own activity */
      }
    };
    touch();
    const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - read() < limit) return;
      window.clearInterval(timer);
      await createClient().auth.signOut({ scope: "local" }).catch(() => {});
      window.location.assign("/login?idle=1");
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, []);

  if (!sealed) return null;
  return (
    <div className="notice sans" role="status" style={{ marginTop: 0, marginBottom: 20 }}>
      <strong>Your vault is sealed (read-only).</strong> Your plan has lapsed, so nothing can be
      added or changed for now. Everything is still here: you can read it, export it, and veto an
      emergency request, and your trusted contacts can still request access.{" "}
      <a href="/app/billing">Renew your plan</a> to make changes again.
    </div>
  );
}
