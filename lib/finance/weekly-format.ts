import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/format";
import { alertKindLabels, allocationStatusLabels, assetTypeLabels } from "@/lib/finance/labels";
import type { Json } from "@/lib/finance/types";
import type { WeeklyReportContent, WeeklyWeight } from "@/lib/finance/weekly-compute";

const SUMMARY_BYTES = 3200;

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
