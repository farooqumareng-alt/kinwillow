// Catch the common slip of mistyping a well-known email provider. Sign-in
// depends on the inbox, so a wrong address locks the person out of the vault
// they just created.

const KNOWN = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "live.com",
  "msn.com",
  "me.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "protonmail.com",
  "proton.me",
];

/** Edit distance where swapping two neighbouring letters counts as one. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * If the address looks like a mistyped well-known provider, return the
 * corrected address; otherwise null.
 */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes(".") || KNOWN.includes(domain)) return null;
  for (const known of KNOWN) {
    if (distance(domain, known) === 1) return `${local}@${known}`;
  }
  return null;
}
