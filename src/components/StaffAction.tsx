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
    if (!res.ok) return json.error || "That didn't work. Please try again.";
    if (json.pending) {
      window.alert("Sent for approval. This needs a second staff member, who has been emailed. Nothing has changed yet.");
    }
    return null;
  } catch {
    return "We couldn't reach KinWillow. Check your connection and try again.";
  }
}
