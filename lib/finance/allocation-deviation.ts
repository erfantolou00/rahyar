import { formatNumber, formatPercent, toNumber } from "@/lib/finance/format";
import { assetTypeLabels } from "@/lib/finance/labels";
import { buildPortfolio } from "@/lib/finance/portfolio";
import type { Allocation, Asset, AssetType, PortfolioSnapshot, Price } from "@/lib/finance/types";

/**
 * Text-only allocation check.
 * The numbers below are a sentence for the owner. This module never places,
 * sizes, or submits a buy, sell, or transfer.
 */

export type TypeWeight = {
  assetType: AssetType;
  value: number;
  weightPercent: number;
};

export type RebalanceDirection = "reduce" | "increase";

export type RebalanceSuggestion = {
  direction: RebalanceDirection;
  /** Percentage points back to the nearest edge of the allowed band. */
  shiftPercent: number;
};

export type AllocationDeviation = {
  assetType: AssetType;
  weightPercent: number;
  minPercent: number;
  maxPercent: number;
  direction: RebalanceDirection;
  shiftPercent: number;
  message: string;
};

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function currentTypeWeights(assets: Asset[], prices: Price[]): TypeWeight[] {
  const snapshot = buildPortfolio(assets, prices, []);
  return snapshot.byType
    .filter((row) => row.value > 0)
    .map((row) => ({
      assetType: row.type,
      value: row.value,
      weightPercent: row.weight,
    }));
}

/**
 * Distance from the current weight to the nearest edge of [min, max].
 * Inside the band, including both edges, there is nothing to suggest.
 */
export function suggestedRebalancePercent(
  weightPercent: number,
  minPercent: number,
  maxPercent: number,
): RebalanceSuggestion | null {
  if (
    !Number.isFinite(weightPercent) ||
    !Number.isFinite(minPercent) ||
    !Number.isFinite(maxPercent) ||
    minPercent > maxPercent
  ) {
    return null;
  }

  const weight = roundPercent(weightPercent);
  const min = roundPercent(minPercent);
  const max = roundPercent(maxPercent);
  if (weight < min) {
    return { direction: "increase", shiftPercent: roundPercent(min - weight) };
  }
  if (weight > max) {
    return { direction: "reduce", shiftPercent: roundPercent(weight - max) };
  }
  return null;
}

export function deviationMessage(input: {
  assetLabel: string;
  weightPercent: number;
  minPercent: number;
  maxPercent: number;
  suggestion: RebalanceSuggestion;
}): string {
  const verb = input.suggestion.direction === "reduce" ? "کاهش" : "افزایش";
  const min = formatNumber(input.minPercent, 2);
  const max = formatNumber(input.maxPercent, 2);
  return `وزن ${input.assetLabel} ${formatPercent(input.weightPercent)} است، بازه‌ی مجاز ${min}-${max}٪، پیشنهاد: ${verb} ${formatPercent(input.suggestion.shiftPercent)}`;
}

/** Bands whose window contains `at`. A later valid_from wins if windows overlap. */
export function activeAllocations(allocations: Allocation[], at: Date): Allocation[] {
  const instant = at.getTime();
  const open = allocations.filter((row) => {
    const from = new Date(row.valid_from).getTime();
    if (Number.isNaN(from) || from > instant) return false;
    if (row.valid_to == null) return true;
    const to = new Date(row.valid_to).getTime();
    return !Number.isNaN(to) && to > instant;
  });

  const byType = new Map<AssetType, Allocation>();
  for (const row of open.sort(
    (left, right) => new Date(left.valid_from).getTime() - new Date(right.valid_from).getTime(),
  )) {
    byType.set(row.asset_type, row);
  }
  return [...byType.values()];
}

export function allocationDeviations(
  snapshot: PortfolioSnapshot,
  allocations: Allocation[],
  at: Date = new Date(),
): AllocationDeviation[] {
  if (!(snapshot.totalValue > 0)) return [];

  const weightByType = new Map(snapshot.byType.map((row) => [row.type, row.weight]));
  const deviations: AllocationDeviation[] = [];

  for (const band of activeAllocations(allocations, at)) {
    const weight = weightByType.get(band.asset_type) ?? 0;
    const minPercent = toNumber(band.min_percent);
    const maxPercent = toNumber(band.max_percent);
    const suggestion = suggestedRebalancePercent(weight, minPercent, maxPercent);
    if (!suggestion) continue;

    const roundedWeight = roundPercent(weight);
    const roundedMin = roundPercent(minPercent);
    const roundedMax = roundPercent(maxPercent);
    deviations.push({
      assetType: band.asset_type,
      weightPercent: roundedWeight,
      minPercent: roundedMin,
      maxPercent: roundedMax,
      direction: suggestion.direction,
      shiftPercent: suggestion.shiftPercent,
      message: deviationMessage({
        assetLabel: assetTypeLabels[band.asset_type],
        weightPercent: roundedWeight,
        minPercent: roundedMin,
        maxPercent: roundedMax,
        suggestion,
      }),
    });
  }

  return deviations.sort((left, right) => right.shiftPercent - left.shiftPercent);
}
