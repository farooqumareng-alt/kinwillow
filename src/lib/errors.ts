// Turn database errors into something a person can act on. Unknown errors
// pass through unchanged so nothing is hidden.
export function friendlyError(message: string | null | undefined): string {
  const m = message ?? "";
  if (/Free plan limit reached/i.test(m)) {
    return "You've reached the 25 items included in the Free plan. Upgrade to Family for unlimited items, or archive an item you no longer need.";
  }
  if (/Trusted contact limit reached/i.test(m)) {
    return "You've reached the number of trusted contacts included in your plan. Upgrade to add more, or remove one first.";
  }
  if (/Free plan includes 1 release scope/i.test(m)) {
    return "The Free plan includes one release scope. Upgrade to Family to create more.";
  }
  if (/row-level security|violates row level/i.test(m)) {
    return "This couldn't be saved. If your vault is sealed (read-only), renew your plan to make changes; otherwise sign in again and retry.";
  }
  if (/can only be vetoed while it is waiting/i.test(m)) {
    return "This request is no longer waiting, so it can't be vetoed. Refresh to see its current state.";
  }
  if (/Error sending (confirmation|recovery|magic link) email/i.test(m)) {
    return "We couldn't send an email to that address. Check it for typos and try again. No account was created.";
  }
  if (/already registered|already been registered/i.test(m)) {
    return "There's already an account for that email. Sign in instead, or reset your password if you've forgotten it.";
  }
  if (/rate limit|only request this after|too many requests/i.test(m)) {
    return "Too many attempts in a short time. Please wait a minute and try again.";
  }
  if (/invalid format|invalid email|is invalid/i.test(m) && /email/i.test(m)) {
    return "That email address doesn't look right. Check it and try again.";
  }
  if (/Failed to fetch|NetworkError/i.test(m)) {
    return "We couldn't reach KinWillow. Check your connection and try again.";
  }
  return m || "Something went wrong. Please try again.";
}

/** True when the error is a plan limit, so the UI can offer an upgrade link. */
export function isPlanLimit(message: string | null | undefined): boolean {
  return /Free plan limit reached|contact limit reached|Free plan includes 1 release scope/i.test(message ?? "");
}
