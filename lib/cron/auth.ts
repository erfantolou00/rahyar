import { timingSafeEqual } from "node:crypto";

export function cronAuthorized(header: string | null, secret: string | null): boolean {
  if (!header || !secret) return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
