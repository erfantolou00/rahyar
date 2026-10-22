import { fisProfit } from "@/lib/finance/fis";
import {
  findCumulative,
  latestCumulative,
  resolveCumulatives,
  shiftFiscalYear,
  type CumulativeStatement,
  type TrendPeriod,
} from "@/lib/finance/trend/series";

export type TrailingTwelveMonths = {
  period: string | null;
  months: number | null;
  sales: number | null;
  fisProfit: number | null;
  eps: number | null;
  gaps: string[];
};

function statementProfit(row: CumulativeStatement, gaps: string[]): number | null {
  const profit = fisProfit(row.operatingProfit, row.otherOperatingIncome);
  if (profit.profit == null) {
    gaps.push(`سود عملیاتی صورت ${row.period} موجود نیست.`);
    return null;
  }
  if (profit.operatingOnly) gaps.push("سایر درآمد عملیاتی جدا نشد و سود عملیاتی به‌جای سود FIS نشست.");
  return profit.profit;
}

function rolled(annual: number | null, current: number | null, prior: number | null): number | null {
  if (annual == null || current == null || prior == null) return null;
  return annual + current - prior;
}

export function ttm(periods: TrendPeriod[]): TrailingTwelveMonths {
  const resolved = resolveCumulatives(periods);
  const gaps = [...resolved.gaps];
  const latest = latestCumulative(resolved.rows);
  if (latest.gap) gaps.push(latest.gap);
  if (!latest.row) return { period: null, months: null, sales: null, fisProfit: null, eps: null, gaps };
  const current = latest.row;
  if (current.months >= 12) {
    if (current.sales == null) gaps.push(`فروش صورت ${current.period} موجود نیست.`);
    if (current.periodEps == null) gaps.push(`سود هر سهم صورت ${current.period} موجود نیست.`);
    return {
      period: current.period,
      months: current.months,
      sales: current.sales,
      fisProfit: statementProfit(current, gaps),
      eps: current.periodEps,
      gaps,
    };
  }
  const priorYear = shiftFiscalYear(current.fiscalYearEnd, -1);
  const annual = priorYear ? findCumulative(resolved.rows, priorYear, 12) : { row: null, gap: null };
  const prior = priorYear ? findCumulative(resolved.rows, priorYear, current.months) : { row: null, gap: null };
  if (annual.gap) gaps.push(annual.gap);
  if (prior.gap) gaps.push(prior.gap);
  if (!priorYear || !annual.row || !prior.row) {
    gaps.push("سالانهٔ پارسال یا تجمعی هم‌دورهٔ پارسال برای دوازده ماه گذشته موجود نیست.");
    return { period: current.period, months: current.months, sales: null, fisProfit: null, eps: null, gaps };
  }
  const sales = rolled(annual.row.sales, current.sales, prior.row.sales);
  const eps = rolled(annual.row.periodEps, current.periodEps, prior.row.periodEps);
  const annualProfit = statementProfit(annual.row, gaps);
  const currentProfit = statementProfit(current, gaps);
  const priorProfit = statementProfit(prior.row, gaps);
  const profit = rolled(annualProfit, currentProfit, priorProfit);
  if (sales == null) gaps.push("فروش یکی از سه صورت دوازده ماه گذشته موجود نیست.");
  if (eps == null) gaps.push("سود هر سهم یکی از سه صورت دوازده ماه گذشته موجود نیست.");
  if (profit == null) gaps.push("سود FIS یکی از سه صورت دوازده ماه گذشته موجود نیست.");
  return { period: current.period, months: current.months, sales, fisProfit: profit, eps, gaps };
}
