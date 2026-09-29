import { normalizeNumericInput } from "@/lib/finance/parse";

export const liveSymbols = ["USD", "GOLD18", "BTC"] as const;
export type LiveSymbol = (typeof liveSymbols)[number];

const aliases: Record<LiveSymbol, string[]> = {
  USD: ["usd", "dollar", "دلار"],
  GOLD18: ["gold18", "geram18", "xau18", "طلا", "طلا18", "طلای18", "طلای18عیار", "طلا18عیار"],
  BTC: ["btc", "bitcoin", "بیتکوین", "بیت‌کوین"],
};

export function normalizeSymbol(value: string): string {
  return normalizeNumericInput(value)
    .toLowerCase()
    .replace(/[\s\u200c\-_/+]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}

export function instrumentForSymbol(symbol: string): LiveSymbol | null {
  const normalized = normalizeSymbol(symbol);
  for (const instrument of liveSymbols) {
    if (aliases[instrument].some((alias) => normalizeSymbol(alias) === normalized)) {
      return instrument;
    }
  }
  return null;
}

export function latestQuote<T extends { symbol: string; timestamp: string }>(
  prices: T[],
  instrument: LiveSymbol,
): T | null {
  const rows = prices
    .filter((price) => price.symbol === instrument)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  return rows[0] ?? null;
}
