// Annual review. An item is "due" once a year has passed since the owner last
// confirmed or edited it — the point is that a family opening this vault can
// tell what was checked recently from what was written once and forgotten.
export const REVIEW_AFTER_DAYS = 365;
export const REVIEW_REMINDER_EVERY_DAYS = 90;
const DAY = 24 * 3600_000;

export function reviewCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REVIEW_AFTER_DAYS * DAY);
}

export function isDueForReview(reviewedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!reviewedAt) return true;
  return new Date(reviewedAt).getTime() < reviewCutoff(now).getTime();
}

/** "3 months ago", "over a year ago" — for showing how old a confirmation is. */
export function agoPhrase(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (days < 1) return "today";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) {
    const months = Math.floor(days / 30.44);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "over a year ago" : `over ${years} years ago`;
}
