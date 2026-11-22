"use client";

/**
 * Ask for a reason, then send one staff action to the server. Returns an
 * error message, or null when it worked. Cancelling the prompt returns "".
 */
export async function runStaffAction(payload: Record<string, unknown>, what: string): Promise<string | null> {
  const reason = window.prompt(`${what}\n\nWhy? (recorded in the staff log)`);
  if (reason === null) return "";
  if (reason.trim().length < 3) return "Please give a short reason. It is recorded in the staff log.";
  try {
    const res = await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, reason }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? null : json.error || "That didn't work. Please try again.";
  } catch {
    return "We couldn't reach KinWillow. Check your connection and try again.";
  }
}
