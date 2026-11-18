import { formatNumber } from "@/lib/finance/format";
import type { DiscreteQuarter } from "@/lib/finance/trend/discrete";
import { shiftFiscalYear } from "@/lib/finance/trend/series";

export type TrendSignalScore = -1 | 0 | 1;

export type TrendSignal = {
  key: "sales_excess" | "margin_change" | "eps_growth";
  label: string;
  score: TrendSignalScore | null;
  value: number | null;
  detail: string;
};

export type TrendVerdict = {
  verdict: "improving" | "stable" | "worse" | null;
  label: string;
  sum: number | null;
  signals: TrendSignal[];
  gaps: string[];
  currentPeriods: string[];
  priorPeriods: string[];
};

const verdictLabels = { improving: "بهبود", stable: "ثابت", worse: "بدتر" } as const;

function direction(value: number): TrendSignalScore {
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function ordered(quarters: DiscreteQuarter[]): DiscreteQuarter[] {
  return [...quarters].sort((left, right) => left.fiscalYearEnd.localeCompare(right.fiscalYearEnd) || left.quarter - right.quarter);
}

function immediatePredecessor(latest: DiscreteQuarter, previous: DiscreteQuarter): boolean {
  if (latest.quarter > 1) return previous.fiscalYearEnd === latest.fiscalYearEnd && previous.quarter === latest.quarter - 1;
  const priorYear = shiftFiscalYear(latest.fiscalYearEnd, -1);
  return previous.quarter === 4 && previous.fiscalYearEnd === priorYear;
}

function combined(first: DiscreteQuarter, second: DiscreteQuarter, field: "sales" | "fisProfit" | "eps"): number | null {
  const left = first[field];
  const right = second[field];
  if (left == null || right == null) return null;
  return left + right;
}

function margin(profit: number | null, sales: number | null): number | null {
  if (profit == null || sales == null || !(sales > 0)) return null;
  return (profit / sales) * 100;
}

function growth(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || !(prior > 0)) return null;
  return ((current - prior) / prior) * 100;
}

export function trendVerdict(quarters: DiscreteQuarter[], inflationPercent: number | null): TrendVerdict {
  const gaps: string[] = [];
  const list = ordered(quarters);
  const latest = list[list.length - 1] ?? null;
  const previous = list[list.length - 2] ?? null;
  if (!latest || !previous || !immediatePredecessor(latest, previous)) {
    gaps.push("دو فصل آخر پشت سر هم در تاریخچه موجود نیستند.");
    return { verdict: null, label: "", sum: null, signals: [], gaps, currentPeriods: [], priorPeriods: [] };
  }
  const priorLatestYear = shiftFiscalYear(latest.fiscalYearEnd, -1);
  const priorPreviousYear = shiftFiscalYear(previous.fiscalYearEnd, -1);
  const byKey = new Map(list.map((quarter) => [`${quarter.fiscalYearEnd}|${quarter.quarter}`, quarter]));
  const priorLatest = priorLatestYear ? byKey.get(`${priorLatestYear}|${latest.quarter}`) ?? null : null;
  const priorPrevious = priorPreviousYear ? byKey.get(`${priorPreviousYear}|${previous.quarter}`) ?? null : null;
  if (!priorLatest || !priorPrevious) {
    gaps.push("همان دو فصل پارسال در تاریخچه موجود نیستند.");
    return {
      verdict: null,
      label: "",
      sum: null,
      signals: [],
      gaps,
      currentPeriods: [previous.period, latest.period],
      priorPeriods: [],
    };
  }

  const currentSales = combined(previous, latest, "sales");
  const priorSales = combined(priorPrevious, priorLatest, "sales");
  const currentProfit = combined(previous, latest, "fisProfit");
  const priorProfit = combined(priorPrevious, priorLatest, "fisProfit");
  const currentEps = combined(previous, latest, "eps");
  const priorEps = combined(priorPrevious, priorLatest, "eps");
  const currentMargin = margin(currentProfit, currentSales);
  const priorMargin = margin(priorProfit, priorSales);
  const salesGrowth = growth(currentSales, priorSales);
  const epsGrowth = growth(currentEps, priorEps);
  const inflation = inflationPercent != null && Number.isFinite(inflationPercent) ? inflationPercent : null;
  const excess = salesGrowth == null || inflation == null ? null : salesGrowth - inflation;
  const marginChange = currentMargin == null || priorMargin == null ? null : currentMargin - priorMargin;

  const signals: TrendSignal[] = [
    {
      key: "sales_excess",
      label: "رشد فروش پس از تورم",
      score: excess == null ? null : direction(excess),
      value: excess,
      detail: excess == null
        ? "رشد فروش دو فصل آخر یا تورم موجود نیست."
        : `رشد فروش دو فصل منتهی به ${latest.period} ${formatNumber(salesGrowth ?? 0, 2)} درصد است. پس از کسر تورم ${formatNumber(inflation ?? 0, 2)} درصد، ${formatNumber(excess, 2)} واحد می‌ماند.`,
    },
    {
      key: "margin_change",
      label: "تغییر حاشیه",
      score: marginChange == null ? null : direction(marginChange),
      value: marginChange,
      detail: marginChange == null
        ? "حاشیهٔ دو فصل آخر یا دو فصل پارسال موجود نیست."
        : `حاشیهٔ دو فصل آخر ${formatNumber(currentMargin ?? 0, 2)} درصد و پارسال ${formatNumber(priorMargin ?? 0, 2)} درصد است. تغییر ${formatNumber(marginChange, 2)} واحد است.`,
    },
    {
      key: "eps_growth",
      label: "رشد سود هر سهم",
      score: epsGrowth == null ? null : direction(epsGrowth),
      value: epsGrowth,
      detail: epsGrowth == null
        ? "سود هر سهم دو فصل آخر یا دو فصل پارسال برای رشد کافی نیست."
        : `سود هر سهم دو فصل آخر نسبت به پارسال ${formatNumber(epsGrowth, 2)} درصد تغییر کرده است.`,
    },
  ];
  for (const signal of signals) {
    if (signal.score == null) gaps.push(signal.detail);
  }
  const scores = signals.map((signal) => signal.score);
  if (scores.some((score) => score == null)) {
    return {
      verdict: null,
      label: "",
      sum: null,
      signals,
      gaps,
      currentPeriods: [previous.period, latest.period],
      priorPeriods: [priorPrevious.period, priorLatest.period],
    };
  }
  const sum = (scores as TrendSignalScore[]).reduce((total, score) => total + score, 0);
  const verdict = sum >= 2 ? "improving" : sum <= -2 ? "worse" : "stable";
  return {
    verdict,
    label: verdictLabels[verdict],
    sum,
    signals,
    gaps,
    currentPeriods: [previous.period, latest.period],
    priorPeriods: [priorPrevious.period, priorLatest.period],
  };
}
