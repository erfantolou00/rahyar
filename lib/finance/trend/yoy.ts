import { shiftFiscalYear } from "@/lib/finance/trend/series";
import type { DiscreteQuarter } from "@/lib/finance/trend/discrete";

export type QuarterGrowth = {
  fiscalYearEnd: string;
  quarter: 1 | 2 | 3 | 4;
  period: string;
  priorFiscalYearEnd: string | null;
  salesGrowthPercent: number | null;
  fisProfitGrowthPercent: number | null;
  marginGrowthPercent: number | null;
  epsGrowthPercent: number | null;
  gaps: string[];
};

function rate(current: number | null, prior: number | null, label: string, gaps: string[]): number | null {
  if (current == null || prior == null) {
    gaps.push(`${label} این فصل یا فصل پارسال موجود نیست.`);
    return null;
  }
  if (!(prior > 0)) {
    gaps.push(`${label} فصل پارسال برای رشد مثبت نیست.`);
    return null;
  }
  return ((current - prior) / prior) * 100;
}

export function yoyByQuarter(quarters: DiscreteQuarter[]): QuarterGrowth[] {
  const byKey = new Map(quarters.map((quarter) => [`${quarter.fiscalYearEnd}|${quarter.quarter}`, quarter]));
  return [...quarters]
    .sort((left, right) => left.fiscalYearEnd.localeCompare(right.fiscalYearEnd) || left.quarter - right.quarter)
    .map((quarter) => {
      const priorYear = shiftFiscalYear(quarter.fiscalYearEnd, -1);
      const prior = priorYear ? byKey.get(`${priorYear}|${quarter.quarter}`) ?? null : null;
      const gaps: string[] = [];
      if (!priorYear || !prior) {
        gaps.push(`همان فصل سال مالی ${priorYear ?? "پارسال"} موجود نیست.`);
        return {
          fiscalYearEnd: quarter.fiscalYearEnd,
          quarter: quarter.quarter,
          period: quarter.period,
          priorFiscalYearEnd: priorYear,
          salesGrowthPercent: null,
          fisProfitGrowthPercent: null,
          marginGrowthPercent: null,
          epsGrowthPercent: null,
          gaps,
        };
      }
      return {
        fiscalYearEnd: quarter.fiscalYearEnd,
        quarter: quarter.quarter,
        period: quarter.period,
        priorFiscalYearEnd: priorYear,
        salesGrowthPercent: rate(quarter.sales, prior.sales, "فروش", gaps),
        fisProfitGrowthPercent: rate(quarter.fisProfit, prior.fisProfit, "سود FIS", gaps),
        marginGrowthPercent: rate(quarter.marginPercent, prior.marginPercent, "حاشیه", gaps),
        epsGrowthPercent: rate(quarter.eps, prior.eps, "سود هر سهم", gaps),
        gaps,
      };
    });
}
