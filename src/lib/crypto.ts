// Field-level encryption for the most sensitive payloads (recovery instructions,
// key locations). AES-256-GCM with a per-household key derived (HKDF-SHA256)
// from the server master key (KINWILLOW_MASTER_KEY, base64, 32 bytes).
// Ciphertext format: v1.<iv b64>.<tag b64>.<data b64>
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

function masterKey(): Buffer {
  const raw = process.env.KINWILLOW_MASTER_KEY;
  if (!raw) throw new Error("KINWILLOW_MASTER_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KINWILLOW_MASTER_KEY must be 32 bytes (base64)");
  return key;
}

export function encryptionConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

function householdKey(householdId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey(), Buffer.from(householdId), Buffer.from("kinwillow-field-v1"), 32)
  );
}

export function encryptField(householdId: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", householdKey(householdId), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${data.toString("base64")}`;
}

export function decryptField(householdId: string, stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unrecognized ciphertext format");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", householdKey(householdId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
