import type { ReplyWarning } from "@/lib/ai/reply-warnings";
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
  flow_value: number;
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
    flow_value: number;
  };
  assets: WeeklyAsset[];
  alerts: WeeklyAlert[];
  weights: WeeklyWeight[];
  /** Null until phase 6 calls withCommentary. The summary never reads this field. */
  commentary: string | null;
  commentary_warnings: ReplyWarning[];
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
  flows?: { assetId: string; amount: number }[];
}): WeeklyReportContent {
  const to = input.now.getTime();
  const from = to - WEEK_MS;
  const flowById = new Map<string, number>();
  for (const flow of input.flows ?? []) {
    flowById.set(flow.assetId, (flowById.get(flow.assetId) ?? 0) + flow.amount);
  }
  const previousById = new Map((input.previous?.assets ?? []).map((asset) => [asset.id, asset]));
  const assets: WeeklyAsset[] = input.snapshot.holdings.map((holding) => {
    const earlier = previousById.get(holding.id);
    const change = weekChange(holding.value, earlier ? earlier.value : null);
    const flow = flowById.get(holding.id) ?? 0;
    const pnl = change.value == null ? null : change.value - flow;
    return {
      id: holding.id,
      type: holding.type,
      symbol: holding.symbol,
      quantity: holding.quantity,
      value: holding.value,
      previous_value: earlier ? earlier.value : null,
      pnl_value: pnl,
      pnl_percent: earlier && earlier.value > 0 && pnl != null ? (pnl / earlier.value) * 100 : null,
      flow_value: flow,
    };
  });

  const currentIds = new Set(assets.map((asset) => asset.id));
  for (const earlier of input.previous?.assets ?? []) {
    if (currentIds.has(earlier.id) || earlier.value === 0) continue;
    const change = weekChange(0, earlier.value);
    const flow = flowById.get(earlier.id) ?? 0;
    const pnl = change.value == null ? null : change.value - flow;
    assets.push({
      id: earlier.id,
      type: earlier.type,
      symbol: earlier.symbol,
      quantity: 0,
      value: 0,
      previous_value: earlier.value,
      pnl_value: pnl,
      pnl_percent: earlier.value > 0 && pnl != null ? (pnl / earlier.value) * 100 : null,
      flow_value: flow,
    });
  }

  assets.sort(
    (left, right) => Math.abs(right.pnl_value ?? 0) - Math.abs(left.pnl_value ?? 0) || right.value - left.value,
  );

  const alerts: WeeklyAlert[] = input.alerts.flatMap((alert) => {
    const createdIn = inRange(alert.created_at, from, to);
    const sentIn = inRange(alert.sent_at, from, to);
    const standingDeviation = alert.kind === "allocation_deviation" && alert.is_active;
    if (!createdIn && !sentIn && !standingDeviation) return [];
    const triggeredAt = sentIn && alert.sent_at
      ? alert.sent_at
      : createdIn
        ? alert.created_at
        : alert.sent_at && Date.parse(alert.sent_at) >= Date.parse(alert.created_at)
          ? alert.sent_at
          : alert.created_at;
    return [
      {
        id: alert.id,
        kind: alert.kind,
        rule: alert.rule,
        message: alert.message,
        asset_type: alert.asset_type,
        threshold: toNumber(alert.threshold),
        created_at: alert.created_at,
        triggered_at: triggeredAt,
        is_active: alert.is_active,
      },
    ];
  });
  alerts.sort((left, right) => Date.parse(right.triggered_at) - Date.parse(left.triggered_at));

  const totalChange = weekChange(
    input.snapshot.totalValue,
    input.previous ? input.previous.portfolio.total_value : null,
  );
  const flowValue = [...flowById.values()].reduce((sum, amount) => sum + amount, 0);
  const priceChange = totalChange.value == null ? null : totalChange.value - flowValue;
  const previousTotal = input.previous ? input.previous.portfolio.total_value : null;

  return {
    schema: WEEKLY_REPORT_SCHEMA,
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    portfolio: {
      total_value: input.snapshot.totalValue,
      previous_total_value: previousTotal,
      change_value: priceChange,
      change_percent:
        previousTotal != null && previousTotal > 0 && priceChange != null
          ? (priceChange / previousTotal) * 100
          : null,
      flow_value: flowValue,
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
    commentary_warnings: [],
  };
}
