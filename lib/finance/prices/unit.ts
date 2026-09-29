import { btcInRial, btcInUsdt } from "@/lib/finance/prices/btc";
import type { LiveSymbol } from "@/lib/finance/prices/match";

export const priceUnits = ["rial", "usd"] as const;
export type PriceUnit = (typeof priceUnits)[number];

export function isPriceUnit(value: string): value is PriceUnit {
  return (priceUnits as readonly string[]).includes(value);
}

export function amountInRial(
  amount: number | null,
  unit: PriceUnit,
  usdRial: number | null,
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (unit === "rial") return amount;
  if (usdRial == null || !(usdRial > 0)) return null;
  return amount * usdRial;
}

export function quoteInUnit(
  instrument: LiveSymbol,
  raw: number,
  unit: PriceUnit,
  usdRial: number | null,
): number | null {
  if (!(raw > 0)) return null;
  if (instrument === "BTC") {
    const usdt = btcInUsdt(raw, usdRial);
    if (usdt == null) return null;
    return unit === "usd" ? usdt : btcInRial(usdt, usdRial);
  }
  if (unit === "rial") return raw;
  if (usdRial == null || !(usdRial > 0)) return null;
  return raw / usdRial;
}
