export type RatePolicy = {
  limit: number;
  windowMs: number;
  minGapMs: number;
};

export const CHAT_POLICY: RatePolicy = {
  limit: 8,
  windowMs: 10 * 60 * 1000,
  minGapMs: 4_000,
};

export const INTERPRET_POLICY: RatePolicy = {
  limit: 4,
  windowMs: 10 * 60 * 1000,
  minGapMs: 8_000,
};

const hits = new Map<string, number[]>();

export function resetRateLimits(): void {
  hits.clear();
}

export function takeRateSlot(
  key: string,
  now: number,
  policy: RatePolicy,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < policy.windowMs);
  const last = recent.at(-1);
  if (last != null && now - last < policy.minGapMs) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((policy.minGapMs - (now - last)) / 1000) };
  }
  if (recent.length >= policy.limit) {
    const oldest = recent[0] ?? now;
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((policy.windowMs - (now - oldest)) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}
