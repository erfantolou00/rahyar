import { normalizeNumericInput } from "@/lib/finance/parse";

const TOKEN = /[0-9۰-۹٠-٩]+(?:[.,٫][0-9۰-۹٠-٩]+)?/g;

const SKIPPED_KEYS = new Set(["from", "to"]);

function canonicalNumber(raw: string): string | null {
  const normalized = normalizeNumericInput(raw.replaceAll("\u066B", "."));
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart, fraction = ""] = normalized.split(".");
  const integer = Number(intPart);
  if (!Number.isSafeInteger(integer)) return null;
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${integer}.${trimmedFraction}` : String(integer);
}

function addNumeric(into: Set<string>, value: number) {
  if (!Number.isFinite(value)) return;
  const exact = canonicalNumber(String(value));
  if (exact) into.add(exact);
  const rounded = canonicalNumber(value.toFixed(2));
  if (rounded) into.add(rounded);
}

function skipKey(key: string | undefined): boolean {
  if (!key) return false;
  return SKIPPED_KEYS.has(key) || key.endsWith("At") || key.endsWith("_at");
}

function collect(value: unknown, into: Set<string>, key?: string): void {
  if (typeof value === "number") {
    addNumeric(into, value);
    return;
  }
  if (typeof value === "string") {
    if (skipKey(key)) return;
    for (const match of value.matchAll(TOKEN)) {
      const token = canonicalNumber(match[0]);
      if (token) into.add(token);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collect(child, into, childKey);
  }
}

/** True when every number in the reply already exists in the supplied facts. */
export function replyUsesKnownNumbers(reply: string, sources: unknown[]): boolean {
  const known = new Set<string>();
  for (const source of sources) collect(source, known);
  const tokens = reply.match(TOKEN) ?? [];
  return tokens.every((token) => {
    const canonical = canonicalNumber(token);
    return canonical != null && known.has(canonical);
  });
}
