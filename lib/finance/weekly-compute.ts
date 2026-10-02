import { toNumber } from "@/lib/finance/format";
import type { Alert, AllocationStatus, AssetType, PortfolioSnapshot } from "@/lib/finance/types";

/**
 * Numeric weekly report. This module never calls a model.
 *
 * Phase 6 adds prose later by reading a saved WeeklyReportContent and writing
 * only `commentary` through `withCommentary`. Leave `buildWeeklyReport` as it
 * is: portfolio, assets, alerts, and weights stay the source of truth.
 */
export const WEEKLY_REPORT_SCHEMA = "weekly.v1" as const;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** A second run inside this gap is skipped. A week-old report remains the baseline. */
export const WEEKLY_RETRY_GAP_MS = 6 * 24 * 60 * 60 * 1000;

export type WeeklyAsset = {
  id: string;
  type: AssetType;
  symbol: string;
  quantity: number;
  value: number;
  previous_value: number | null;
  pnl_value: number | null;
  pnl_percent: number | null;
};

export type WeeklyAlert = {
  id: string;
  kind: Alert["kind"];
  rule: string;
  message: string | null;
  asset_type: AssetType | null;
  threshold: number;
  created_at: string;
  triggered_at: string;
  is_active: boolean;
};

export type WeeklyWeight = {
  type: AssetType;
  value: number;
  weight: number;
  min_percent: number | null;
  max_percent: number | null;
  status: AllocationStatus;
  gap_percent: number | null;
};

export type WeeklyReportContent = {
  schema: typeof WEEKLY_REPORT_SCHEMA;
  period: { from: string; to: string };
  portfolio: {
    total_value: number;
    previous_total_value: number | null;
    change_value: number | null;
    change_percent: number | null;
  };
  assets: WeeklyAsset[];
  alerts: WeeklyAlert[];
  weights: WeeklyWeight[];
  /** Null until phase 6 calls withCommentary. The summary never reads this field. */
  commentary: string | null;
};

function weekChange(current: number, previous: number | null): { value: number | null; percent: number | null } {
  if (previous == null) return { value: null, percent: null };
  const value = current - previous;
  return { value, percent: previous === 0 ? null : (value / previous) * 100 };
}

function inRange(iso: string | null, from: number, to: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return !Number.isNaN(at) && at >= from && at <= to;
}

function bandGap(
  weight: number,
  min: number | null,
  max: number | null,
  status: AllocationStatus,
): number | null {
  if (status === "unset" || min == null || max == null) return null;
  if (status === "below") return weight - min;
  if (status === "above") return weight - max;
  return 0;
}

export function shouldCreateWeekly(latestCreatedAt: string | null, now: Date): boolean {
  if (!latestCreatedAt) return true;
  const latest = Date.parse(latestCreatedAt);
  if (Number.isNaN(latest)) return true;
  return now.getTime() - latest >= WEEKLY_RETRY_GAP_MS;
}

export function buildWeeklyReport(input: {
  now: Date;
  snapshot: PortfolioSnapshot;
  previous: WeeklyReportContent | null;
  alerts: Alert[];
}): WeeklyReportContent {
  const to = input.now.getTime();
  const from = to - WEEK_MS;
  const previousById = new Map((input.previous?.assets ?? []).map((asset) => [asset.id, asset]));
  const assets: WeeklyAsset[] = input.snapshot.holdings.map((holding) => {
    const earlier = previousById.get(holding.id);
    const change = weekChange(holding.value, earlier ? earlier.value : null);
    return {
      id: holding.id,
      type: holding.type,
      symbol: holding.symbol,
      quantity: holding.quantity,
      value: holding.value,
      previous_value: earlier ? earlier.value : null,
      pnl_value: change.value,
      pnl_percent: change.percent,
    };
  });

  const currentIds = new Set(assets.map((asset) => asset.id));
  for (const earlier of input.previous?.assets ?? []) {
    if (currentIds.has(earlier.id) || earlier.value === 0) continue;
    const change = weekChange(0, earlier.value);
    assets.push({
      id: earlier.id,
      type: earlier.type,
      symbol: earlier.symbol,
      quantity: 0,
      value: 0,
      previous_value: earlier.value,
      pnl_value: change.value,
      pnl_percent: change.percent,
    });
  }

  assets.sort(
    (left, right) => Math.abs(right.pnl_value ?? 0) - Math.abs(left.pnl_value ?? 0) || right.value - left.value,
  );

  const alerts: WeeklyAlert[] = input.alerts.flatMap((alert) => {
    const createdIn = inRange(alert.created_at, from, to);
    const sentIn = inRange(alert.sent_at, from, to);
    if (!createdIn && !sentIn) return [];
    return [
      {
        id: alert.id,
        kind: alert.kind,
        rule: alert.rule,
        message: alert.message,
        asset_type: alert.asset_type,
        threshold: toNumber(alert.threshold),
        created_at: alert.created_at,
        triggered_at: createdIn ? alert.created_at : (alert.sent_at as string),
        is_active: alert.is_active,
      },
    ];
  });
  alerts.sort((left, right) => Date.parse(right.triggered_at) - Date.parse(left.triggered_at));

  const totalChange = weekChange(
    input.snapshot.totalValue,
    input.previous ? input.previous.portfolio.total_value : null,
  );

  return {
    schema: WEEKLY_REPORT_SCHEMA,
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    portfolio: {
      total_value: input.snapshot.totalValue,
      previous_total_value: input.previous ? input.previous.portfolio.total_value : null,
      change_value: totalChange.value,
      change_percent: totalChange.percent,
    },
    assets,
    alerts,
    weights: input.snapshot.byType.map((row) => ({
      type: row.type,
      value: row.value,
      weight: row.weight,
      min_percent: row.minPercent,
      max_percent: row.maxPercent,
      status: row.status,
      gap_percent: bandGap(row.weight, row.minPercent, row.maxPercent, row.status),
    })),
    commentary: null,
  };
}
