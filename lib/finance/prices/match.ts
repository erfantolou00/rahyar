import { normalizeNumericInput } from "@/lib/finance/parse";
import type { AssetType } from "@/lib/finance/types";

export const liveSymbols = ["USD", "GOLD18", "EMAMI", "BAHAR", "NIM", "ROB", "BTC"] as const;
export type LiveSymbol = (typeof liveSymbols)[number];

export const liveSymbolLabels: Record<LiveSymbol, string> = {
  USD: "دلار",
  GOLD18: "طلای ۱۸ عیار",
  EMAMI: "سکه امامی",
  BAHAR: "سکه بهار آزادی",
  NIM: "نیم سکه",
  ROB: "ربع سکه",
  BTC: "بیت‌کوین",
};

export const liveAssetTypes: Record<LiveSymbol, AssetType> = {
  USD: "usd",
  GOLD18: "gold",
  EMAMI: "coin",
  BAHAR: "coin",
  NIM: "coin",
  ROB: "coin",
  BTC: "crypto",
};

const aliases: Record<LiveSymbol, string[]> = {
  USD: ["usd", "dollar", "دلار"],
  GOLD18: ["gold18", "geram18", "xau18", "طلا", "طلا18", "طلای18", "طلای18عیار", "طلا18عیار"],
  EMAMI: [
    "emami",
    "sekee",
    "امامی",
    "سکه امامی",
    "سکه امام",
    "سکه طرح جدید",
    "طرح جدید",
    "تمام سکه",
    "سکه تمام",
    "سکه تمام بهار آزادی",
    "سکه بهار آزادی طرح جدید",
  ],
  BAHAR: [
    "bahar",
    "sekeb",
    "بهار آزادی",
    "سکه بهار آزادی",
    "سکه طرح قدیم",
    "طرح قدیم",
    "سکه بهار آزادی طرح قدیم",
    "سکه تمام طرح قدیم",
  ],
  NIM: ["nim", "نیم سکه", "نیمسکه", "سکه نیم", "نیم سکه بهار آزادی", "نیم سکه امامی"],
  ROB: ["rob", "ربع سکه", "ربعسکه", "سکه ربع", "ربع سکه بهار آزادی", "ربع سکه امامی"],
  BTC: ["btc", "bitcoin", "بیتکوین", "بیت‌کوین"],
};

export function normalizeSymbol(value: string): string {
  return normalizeNumericInput(value)
    .toLowerCase()
    .replace(/[\s\u200c\-_/+]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}

export function isLiveSymbol(value: string): value is LiveSymbol {
  return (liveSymbols as readonly string[]).includes(value);
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

export function instrumentForAsset(type: string, symbol: string): LiveSymbol | null {
  if (type === "usd") return "USD";
  return instrumentForSymbol(symbol);
}

export function canonicalFeed(type: AssetType, symbol: string): { assetType: AssetType; symbol: string } | null {
  const trimmed = symbol.trim();
  if (!trimmed || trimmed.length > 32) return null;
  return quoteSeriesKey(type, trimmed);
}

/** Series key used by stored market quotes. Display names such as طلا map to GOLD18 and امامی to EMAMI. */
export function quoteSeriesKey(type: AssetType, symbol: string): { assetType: AssetType; symbol: string } {
  const instrument = instrumentForAsset(type, symbol);
  if (instrument) return { assetType: liveAssetTypes[instrument], symbol: instrument };
  return { assetType: type, symbol: symbol.trim() };
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
