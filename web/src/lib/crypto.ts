import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Base64(secret: string, body: Buffer): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function escapeCsv(value: string): string {
  const trimmed = value.replace(/^\t+/, "");
  const prefixed = /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
  if (/[",\n]/.test(prefixed)) return `"${prefixed.replace(/"/g, '""')}"`;
  return prefixed;
}
