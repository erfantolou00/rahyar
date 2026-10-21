import type { PlannedMonth, PlannedPeriod } from "@/lib/finance/history";
import type { FinanceClient } from "@/lib/finance/queries";
import type { Json, StatementKind } from "@/lib/finance/types";
import type { StatementFigures } from "@/lib/finance/codal/parse";

function schemaGap(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204"
    || error.code === "PGRST205"
    || error.code === "42703"
    || error.code === "42P01"
    || /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

function figuresJson(figures: StatementFigures): Json {
  return {
    sales: figures.sales,
    netIncome: figures.netIncome,
    equity: figures.equity,
    periodEps: figures.periodEps,
    operatingProfit: figures.operatingProfit,
    otherOperatingIncome: figures.otherOperatingIncome,
    totalAssets: figures.totalAssets,
    receivables: figures.receivables,
    inventory: figures.inventory,
    priorInventory: figures.priorInventory,
    cogs: figures.cogs,
    retainedEarnings: figures.retainedEarnings,
    priorPeriodSales: figures.priorPeriodSales,
  };
}

function uniquePeriods(rows: PlannedPeriod[]): PlannedPeriod[] {
  const byTracing = new Map<string, PlannedPeriod>();
  for (const row of rows) byTracing.set(row.tracingNo, row);
  return [...byTracing.values()];
}

function uniqueMonths(rows: PlannedMonth[]): PlannedMonth[] {
  const byPeriod = new Map<string, PlannedMonth>();
  for (const row of rows) byPeriod.set(row.period, row);
  return [...byPeriod.values()];
}

export async function saveFundamentalHistory(
  supabase: FinanceClient,
  userId: string,
  symbol: string,
  periods: PlannedPeriod[],
  months: PlannedMonth[],
): Promise<{ ok: true; periods: number; months: number } | { ok: false; missingSchema: boolean; message: string }> {
  const periodRows = uniquePeriods(periods);
  const monthRows = uniqueMonths(months);
  const fetchedAt = new Date().toISOString();
  if (periodRows.length > 0) {
    const saved = await supabase.from("stock_periods").upsert(
      periodRows.map((row) => ({
        user_id: userId,
        symbol,
        period: row.period,
        months: row.months,
        kind: row.kind satisfies StatementKind,
        tracing_no: row.tracingNo,
        revision_of: row.revisionOf,
        figures: figuresJson(row.figures),
        source: row.source,
        fetched_at: fetchedAt,
      })),
      { onConflict: "user_id,symbol,tracing_no" },
    );
    if (saved.error) return { ok: false, missingSchema: schemaGap(saved.error), message: saved.error.message };
  }
  if (monthRows.length > 0) {
    const saved = await supabase.from("stock_monthly").upsert(
      monthRows.map((row) => ({
        user_id: userId,
        symbol,
        period: row.period,
        sales_value: row.salesValue,
        sales_qty: row.salesQty,
        production_qty: row.productionQty,
        avg_rate: row.avgRate,
        tracing_no: row.tracingNo,
        source: row.source,
      })),
      { onConflict: "user_id,symbol,period" },
    );
    if (saved.error) return { ok: false, missingSchema: schemaGap(saved.error), message: saved.error.message };
  }
  return { ok: true, periods: periodRows.length, months: monthRows.length };
}
