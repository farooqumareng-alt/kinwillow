import crypto from "node:crypto";

// 6-digit login codes: only the SHA-256 hash (salted with the email) is ever
// stored. The plaintext code lives only in memory long enough to email it.
// Never log or persist a plaintext code.

export function generateLoginCode(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashLoginCode(code: string, email: string): string {
  return crypto.createHash("sha256").update(`${code}:${email}`).digest("hex");
}

// Constant-time comparison for hex digests (equal length by construction).
export function hashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
