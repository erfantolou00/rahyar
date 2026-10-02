import { assetTypes, isAlertKind, type AllocationStatus, type AssetType } from "@/lib/finance/types";
import {
  WEEKLY_REPORT_SCHEMA,
  WEEKLY_RETRY_GAP_MS,
  type WeeklyAlert,
  type WeeklyAsset,
  type WeeklyReportContent,
  type WeeklyWeight,
} from "@/lib/finance/weekly-compute";

const allocationStatuses: AllocationStatus[] = ["inside", "below", "above", "unset"];

export function baselineWeekly(
  rows: { created_at: string; content: unknown }[],
  now: Date,
): WeeklyReportContent | null {
  const cutoff = now.getTime() - WEEKLY_RETRY_GAP_MS;
  const sorted = [...rows].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  for (const row of sorted) {
    const at = Date.parse(row.created_at);
    if (Number.isNaN(at) || at > cutoff) continue;
    const parsed = parseWeeklyContent(row.content);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Phase 6 entry point. Copies the numeric report and sets `commentary`.
 * A blank string leaves the report unchanged. Do not recalculate the numbers here.
 */
export function withCommentary(content: WeeklyReportContent, text: string): WeeklyReportContent {
  const commentary = text.trim().slice(0, 4000);
  if (!commentary) return content;
  const clone = parseWeeklyContent(structuredClone(content));
  if (!clone) return content;
  return { ...clone, commentary };
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value == null) return null;
  return readNumber(value);
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" && assetTypes.some((type) => type === value);
}

function isStatus(value: unknown): value is AllocationStatus {
  return allocationStatuses.some((status) => status === value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseWeeklyContent(value: unknown): WeeklyReportContent | null {
  const row = readRecord(value);
  if (!row || row.schema !== WEEKLY_REPORT_SCHEMA) return null;
  const period = readRecord(row.period);
  const portfolio = readRecord(row.portfolio);
  const from = typeof period?.from === "string" ? period.from : null;
  const to = typeof period?.to === "string" ? period.to : null;
  const total = portfolio ? readNumber(portfolio.total_value) : undefined;
  const previousTotal = portfolio ? readNullableNumber(portfolio.previous_total_value) : undefined;
  const changeValue = portfolio ? readNullableNumber(portfolio.change_value) : undefined;
  const changePercent = portfolio ? readNullableNumber(portfolio.change_percent) : undefined;
  if (!from || !to || total == null || previousTotal === undefined || changeValue === undefined || changePercent === undefined) {
    return null;
  }

  const assets: WeeklyAsset[] = [];
  if (Array.isArray(row.assets)) {
    for (const item of row.assets) {
      const asset = readRecord(item);
      if (!asset || typeof asset.id !== "string" || typeof asset.symbol !== "string" || !isAssetType(asset.type)) continue;
      const quantity = readNumber(asset.quantity);
      const assetValue = readNumber(asset.value);
      const previousValue = readNullableNumber(asset.previous_value);
      const pnlValue = readNullableNumber(asset.pnl_value);
      const pnlPercent = readNullableNumber(asset.pnl_percent);
      if (quantity == null || assetValue == null || previousValue === undefined || pnlValue === undefined || pnlPercent === undefined) {
        continue;
      }
      assets.push({
        id: asset.id,
        type: asset.type,
        symbol: asset.symbol,
        quantity,
        value: assetValue,
        previous_value: previousValue,
        pnl_value: pnlValue,
        pnl_percent: pnlPercent,
      });
    }
  }

  const alerts: WeeklyAlert[] = [];
  if (Array.isArray(row.alerts)) {
    for (const item of row.alerts) {
      const alert = readRecord(item);
      const kind = typeof alert?.kind === "string" && isAlertKind(alert.kind) ? alert.kind : null;
      if (!alert || typeof alert.id !== "string" || typeof alert.rule !== "string" || !kind) continue;
      const threshold = readNumber(alert.threshold);
      const createdAt = typeof alert.created_at === "string" ? alert.created_at : null;
      if (threshold == null || !createdAt || typeof alert.is_active !== "boolean") continue;
      const assetType = alert.asset_type == null ? null : isAssetType(alert.asset_type) ? alert.asset_type : undefined;
      if (assetType === undefined) continue;
      alerts.push({
        id: alert.id,
        kind,
        rule: alert.rule,
        message: typeof alert.message === "string" ? alert.message : null,
        asset_type: assetType,
        threshold,
        created_at: createdAt,
        triggered_at: typeof alert.triggered_at === "string" ? alert.triggered_at : createdAt,
        is_active: alert.is_active,
      });
    }
  }

  const weights: WeeklyWeight[] = [];
  if (Array.isArray(row.weights)) {
    for (const item of row.weights) {
      const weight = readRecord(item);
      if (!weight || !isAssetType(weight.type) || !isStatus(weight.status)) continue;
      const amount = readNumber(weight.value);
      const share = readNumber(weight.weight);
      const minPercent = readNullableNumber(weight.min_percent);
      const maxPercent = readNullableNumber(weight.max_percent);
      const gap = readNullableNumber(weight.gap_percent);
      if (amount == null || share == null || minPercent === undefined || maxPercent === undefined || gap === undefined) continue;
      weights.push({
        type: weight.type,
        value: amount,
        weight: share,
        min_percent: minPercent,
        max_percent: maxPercent,
        status: weight.status,
        gap_percent: gap,
      });
    }
  }

  const commentary = typeof row.commentary === "string" && row.commentary.trim() ? row.commentary.trim() : null;
  return {
    schema: WEEKLY_REPORT_SCHEMA,
    period: { from, to },
    portfolio: {
      total_value: total,
      previous_total_value: previousTotal,
      change_value: changeValue,
      change_percent: changePercent,
    },
    assets,
    alerts,
    weights,
    commentary,
  };
}
