import { toNumber } from "@/lib/finance/format";
import { normalizeSymbol } from "@/lib/finance/prices/match";
import type { Numeric } from "@/lib/finance/types";

export function isListedHolding(type: string): type is "stock" | "fund" {
  return type === "stock" || type === "fund";
}

export function sameHoldingSymbol(left: string, right: string): boolean {
  return normalizeSymbol(left) === normalizeSymbol(right);
}

export function blendAverageBuy(
  oldQuantity: number,
  oldAverage: number | null,
  addedQuantity: number,
  addedAverage: number | null,
): number | null {
  if (!(addedQuantity > 0)) return oldAverage;
  if (!(oldQuantity > 0)) return addedAverage;
  if (oldAverage == null || addedAverage == null) return oldAverage;
  return (oldQuantity * oldAverage + addedQuantity * addedAverage) / (oldQuantity + addedQuantity);
}

export function earlierIsoDate(current: string | null, incoming: string): string {
  if (!current) return incoming;
  return current <= incoming ? current : incoming;
}

export type ListedRow = {
  id: string;
  symbol: string;
  quantity: Numeric;
  avg_buy_price: Numeric | null;
  price_unit: string;
  acquired_on: string | null;
  created_at: string;
};

export function findListedMatch<T extends { symbol: string; created_at: string }>(
  rows: T[],
  symbol: string,
): T | null {
  const matches = rows
    .filter((row) => sameHoldingSymbol(row.symbol, symbol))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  return matches[0] ?? null;
}

export function mergedListedPosition(
  existing: ListedRow,
  added: { quantity: number; avgBuyPrice: number | null; acquiredOn: string },
): { quantity: number; avgBuyPrice: number | null; acquiredOn: string } {
  return {
    quantity: toNumber(existing.quantity) + added.quantity,
    avgBuyPrice: blendAverageBuy(
      toNumber(existing.quantity),
      existing.avg_buy_price == null ? null : toNumber(existing.avg_buy_price),
      added.quantity,
      added.avgBuyPrice,
    ),
    acquiredOn: earlierIsoDate(existing.acquired_on, added.acquiredOn),
  };
}
