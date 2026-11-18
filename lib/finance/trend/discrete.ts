import { formatNumber } from "@/lib/finance/format";
import { fisProfit } from "@/lib/finance/fis";
import {
  findCumulative,
  resolveCumulatives,
  type CumulativeStatement,
  type TrendPeriod,
} from "@/lib/finance/trend/series";

export type DiscreteQuarter = {
  fiscalYearEnd: string;
  quarter: 1 | 2 | 3 | 4;
  period: string;
  throughMonths: 3 | 6 | 9 | 12;
  sales: number | null;
  fisProfit: number | null;
  marginPercent: number | null;
  eps: number | null;
  gaps: string[];
};

function emptyQuarter(
  row: CumulativeStatement,
  quarter: 1 | 2 | 3 | 4,
  gap: string,
): DiscreteQuarter {
  return {
    fiscalYearEnd: row.fiscalYearEnd,
    quarter,
    period: row.period,
    throughMonths: (quarter * 3) as 3 | 6 | 9 | 12,
    sales: null,
    fisProfit: null,
    marginPercent: null,
    eps: null,
    gaps: [gap],
  };
}

function marginOf(profit: number | null, sales: number | null, gaps: string[]): number | null {
  if (profit == null || sales == null) return null;
  if (!(sales > 0)) {
    gaps.push("فروش فصل برای حاشیه مثبت نیست.");
    return null;
  }
  return (profit / sales) * 100;
}

function profitOfStatement(row: TrendPeriod, gaps: string[]): number | null {
  const profit = fisProfit(row.operatingProfit, row.otherOperatingIncome);
  if (profit.profit == null) {
    gaps.push(`سود عملیاتی صورت ${row.period} موجود نیست.`);
    return null;
  }
  if (profit.operatingOnly) gaps.push("سایر درآمد عملیاتی جدا نشد و سود عملیاتی به‌جای سود FIS نشست.");
  return profit.profit;
}

function fromStatement(row: CumulativeStatement): DiscreteQuarter {
  const gaps: string[] = [];
  if (row.sales == null) gaps.push(`فروش صورت ${row.period} موجود نیست.`);
  if (row.periodEps == null) gaps.push(`سود هر سهم صورت ${row.period} موجود نیست.`);
  const profit = profitOfStatement(row, gaps);
  return {
    fiscalYearEnd: row.fiscalYearEnd,
    quarter: 1,
    period: row.period,
    throughMonths: 3,
    sales: row.sales,
    fisProfit: profit,
    marginPercent: marginOf(profit, row.sales, gaps),
    eps: row.periodEps,
    gaps,
  };
}

function subtract(later: number | null, earlier: number | null): number | null {
  if (later == null || earlier == null) return null;
  return later - earlier;
}

function fromDifference(
  later: CumulativeStatement,
  earlier: CumulativeStatement,
  quarter: 2 | 3 | 4,
): DiscreteQuarter {
  const gaps: string[] = [];
  const sales = subtract(later.sales, earlier.sales);
  if (sales == null) gaps.push(`فروش صورت ${later.period} یا ${earlier.period} موجود نیست.`);
  const eps = subtract(later.periodEps, earlier.periodEps);
  if (eps == null) gaps.push(`سود هر سهم صورت ${later.period} یا ${earlier.period} موجود نیست.`);
  const operating = subtract(later.operatingProfit, earlier.operatingProfit);
  const otherKnown = later.otherOperatingIncome != null && earlier.otherOperatingIncome != null;
  let profit: number | null = null;
  if (operating == null) gaps.push(`سود عملیاتی صورت ${later.period} یا ${earlier.period} موجود نیست.`);
  else if (!otherKnown) gaps.push(`سایر درآمد عملیاتی یکی از صورت‌های منتهی به ${later.period} موجود نیست.`);
  else profit = operating - ((later.otherOperatingIncome ?? 0) - (earlier.otherOperatingIncome ?? 0));
  return {
    fiscalYearEnd: later.fiscalYearEnd,
    quarter,
    period: later.period,
    throughMonths: (quarter * 3) as 6 | 9 | 12,
    sales,
    fisProfit: profit,
    marginPercent: marginOf(profit, sales, gaps),
    eps,
    gaps,
  };
}

export function discreteQuarters(periods: TrendPeriod[]): { quarters: DiscreteQuarter[]; gaps: string[] } {
  const resolved = resolveCumulatives(periods);
  const gaps = [...resolved.gaps];
  const quarters: DiscreteQuarter[] = [];
  const years = [...new Set(resolved.rows.map((row) => row.fiscalYearEnd))].sort();
  for (const fiscalYear of years) {
    for (const quarter of [1, 2, 3, 4] as const) {
      const months = quarter * 3;
      const current = findCumulative(resolved.rows, fiscalYear, months);
      if (current.gap) gaps.push(current.gap);
      if (!current.row) continue;
      if (quarter === 1) {
        quarters.push(fromStatement(current.row));
        continue;
      }
      const earlier = findCumulative(resolved.rows, fiscalYear, months - 3);
      if (earlier.gap) gaps.push(earlier.gap);
      if (!earlier.row) {
        const reason = `صورت ${formatNumber(months - 3)} ماههٔ سال مالی ${fiscalYear} برای جدا کردن فصل ${formatNumber(quarter)} موجود نیست.`;
        gaps.push(reason);
        quarters.push(emptyQuarter(current.row, quarter, reason));
        continue;
      }
      quarters.push(fromDifference(current.row, earlier.row, quarter));
    }
  }
  return { quarters, gaps };
}
