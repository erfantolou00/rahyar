import type { TrendPeriod } from "@/lib/finance/trend/series";

export type StoredTrendRow = {
  symbol: string;
  period: string;
  months: number;
  tracingNo: string;
  revisionOf: string | null;
  figures: unknown;
};

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function trendPeriodFromStored(input: Omit<StoredTrendRow, "symbol">): TrendPeriod | null {
  if (!input.period || !Number.isInteger(input.months)) return null;
  if (!input.figures || typeof input.figures !== "object" || Array.isArray(input.figures)) return null;
  const figures = input.figures as Record<string, unknown>;
  return {
    period: input.period,
    months: input.months,
    tracingNo: input.tracingNo,
    revisionOf: input.revisionOf,
    sales: finite(figures.sales),
    netIncome: finite(figures.netIncome),
    operatingProfit: finite(figures.operatingProfit),
    otherOperatingIncome: finite(figures.otherOperatingIncome),
    periodEps: finite(figures.periodEps),
  };
}

export function groupTrendRows(rows: StoredTrendRow[]): { bySymbol: Map<string, TrendPeriod[]>; gaps: Map<string, string[]> } {
  const bySymbol = new Map<string, TrendPeriod[]>();
  const gaps = new Map<string, string[]>();
  for (const row of rows) {
    const period = trendPeriodFromStored(row);
    if (!period) {
      const list = gaps.get(row.symbol) ?? [];
      list.push(`صورت ${row.period} در تاریخچه رقم قابل‌خواندن ندارد.`);
      gaps.set(row.symbol, list);
      continue;
    }
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(period);
    bySymbol.set(row.symbol, list);
  }
  return { bySymbol, gaps };
}
