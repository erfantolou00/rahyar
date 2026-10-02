import { formatMoney, formatNumber, formatPercent, toNumber } from "@/lib/finance/format";
import { alertKindLabels, allocationStatusLabels, assetTypeLabels } from "@/lib/finance/labels";
import type {
  Alert,
  AllocationStatus,
  AssetType,
  Json,
  PortfolioSnapshot,
} from "@/lib/finance/types";
import { assetTypes, isAlertKind } from "@/lib/finance/types";

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

const SUMMARY_BYTES = 3200;

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

const allocationStatuses: AllocationStatus[] = ["inside", "below", "above", "unset"];

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

export function weeklyContentJson(content: WeeklyReportContent): Json {
  return {
    schema: content.schema,
    period: { from: content.period.from, to: content.period.to },
    portfolio: {
      total_value: content.portfolio.total_value,
      previous_total_value: content.portfolio.previous_total_value,
      change_value: content.portfolio.change_value,
      change_percent: content.portfolio.change_percent,
    },
    assets: content.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      symbol: asset.symbol,
      quantity: asset.quantity,
      value: asset.value,
      previous_value: asset.previous_value,
      pnl_value: asset.pnl_value,
      pnl_percent: asset.pnl_percent,
    })),
    alerts: content.alerts.map((alert) => ({
      id: alert.id,
      kind: alert.kind,
      rule: alert.rule,
      message: alert.message,
      asset_type: alert.asset_type,
      threshold: alert.threshold,
      created_at: alert.created_at,
      triggered_at: alert.triggered_at,
      is_active: alert.is_active,
    })),
    weights: content.weights.map((weight) => ({
      type: weight.type,
      value: weight.value,
      weight: weight.weight,
      min_percent: weight.min_percent,
      max_percent: weight.max_percent,
      status: weight.status,
      gap_percent: weight.gap_percent,
    })),
    commentary: content.commentary,
  };
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

export function formatSignedMoney(value: number): string {
  if (value > 0) return `+${formatMoney(value)}`;
  return formatMoney(value);
}

export function formatSignedPercent(value: number): string {
  if (value > 0) return `+${formatPercent(value)}`;
  return formatPercent(value);
}

export function formatWeekChange(value: number | null, percent: number | null): string {
  if (value == null) return "هنوز گزارش هفته قبل نیست";
  const share = percent == null ? "" : ` (${formatSignedPercent(percent)})`;
  return `${formatSignedMoney(value)}${share}`;
}

export function formatAssetPnl(value: number | null, percent: number | null): string {
  if (value == null) return "بدون مبنای هفته قبل";
  return formatWeekChange(value, percent);
}

export function formatWeightBand(row: WeeklyWeight): string {
  const band =
    row.min_percent == null || row.max_percent == null
      ? "بازه تعیین نشده"
      : `مجاز ${formatNumber(row.min_percent, 2)}–${formatNumber(row.max_percent, 2)}`;
  const gap =
    row.gap_percent == null || row.status === "inside" || row.status === "unset"
      ? ""
      : ` · انحراف ${formatNumber(row.gap_percent, 2)}`;
  return `${formatPercent(row.weight)} · ${band} · ${allocationStatusLabels[row.status]}${gap}`;
}

function withinBytes(text: string, maxBytes: number): string {
  if (new TextEncoder().encode(text).byteLength <= maxBytes) return text;
  let end = text.length;
  while (end > 0 && new TextEncoder().encode(text.slice(0, end)).byteLength > maxBytes) end -= 1;
  return text.slice(0, end);
}

export function formatWeeklySummary(content: WeeklyReportContent): string {
  const header = [
    "گزارش هفتگی رهیار",
    `ارزش سبد: ${formatMoney(content.portfolio.total_value)}`,
    `تغییر نسبت به هفته قبل: ${formatWeekChange(content.portfolio.change_value, content.portfolio.change_percent)}`,
  ];
  const alertLines = content.alerts.slice(0, 5).map((alert) => {
    const subject = alert.asset_type ? assetTypeLabels[alert.asset_type] : alert.rule;
    return `${alertKindLabels[alert.kind]} · ${subject} · آستانه ${formatNumber(alert.threshold, 2)}`;
  });
  const weightLines = [
    "وزن نسبت به محدوده:",
    ...(content.weights.length === 0
      ? ["طبقه‌ای ثبت نشده است."]
      : content.weights.map((weight) => `${assetTypeLabels[weight.type]}: ${formatWeightBand(weight)}`)),
  ];

  let shown = Math.min(8, content.assets.length);
  let text = "";
  while (shown >= 0) {
    const assetLines =
      content.assets.length === 0
        ? ["دارایی‌ای ثبت نشده است."]
        : content.assets.slice(0, shown).map((asset) => `${asset.symbol}: ${formatAssetPnl(asset.pnl_value, asset.pnl_percent)}`);
    if (content.assets.length > shown) {
      assetLines.push(`و ${formatNumber(content.assets.length - shown, 0)} دارایی دیگر`);
    }
    text = [
      ...header,
      "",
      "سود و زیان دارایی‌ها:",
      ...assetLines,
      "",
      `هشدارهای این هفته: ${formatNumber(content.alerts.length, 0)}`,
      ...alertLines,
      "",
      ...weightLines,
    ].join("\n");
    if (new TextEncoder().encode(text).byteLength <= SUMMARY_BYTES || shown === 0) break;
    shown -= 1;
  }

  return withinBytes(text, SUMMARY_BYTES);
}
