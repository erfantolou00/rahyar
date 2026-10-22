import { formatNumber } from "@/lib/finance/format";
import { annualize, fisProfit } from "@/lib/finance/fis";
import {
  findCumulative,
  latestCumulative,
  resolveCumulatives,
  shiftFiscalYear,
  type CumulativeStatement,
  type TrendPeriod,
} from "@/lib/finance/trend/series";

export type ForecastLine = {
  forecast: number | null;
  share: number | null;
  method: "seasonal" | "linear" | null;
  gaps: string[];
};

export type SeasonalForecast = {
  sales: ForecastLine;
  fisProfit: ForecastLine;
  eps: ForecastLine;
};

const SHARE_MIN = 0.1;
const SHARE_MAX = 1;

function statementProfit(row: CumulativeStatement): number | null {
  return fisProfit(row.operatingProfit, row.otherOperatingIncome).profit;
}

function line(amount: number | null, months: number | null, label: string): ForecastLine {
  if (amount == null || months == null) {
    return { forecast: null, share: null, method: null, gaps: [`${label} دورهٔ جاری موجود نیست.`] };
  }
  return { forecast: annualize(amount, months), share: null, method: "linear", gaps: [] };
}

function clampShare(share: number): number {
  return Math.min(SHARE_MAX, Math.max(SHARE_MIN, share));
}

function forecastField(input: {
  label: string;
  current: number | null;
  months: number;
  priorSame: number | null;
  priorAnnual: number | null;
  missingBase: boolean;
}): ForecastLine {
  const linear = line(input.current, input.months, input.label);
  if (input.missingBase) {
    linear.gaps.unshift(`سالانهٔ پارسال یا تجمعی هم‌دورهٔ پارسال برای ${input.label} موجود نیست و پیش‌بینی خطی شد.`);
    return linear;
  }
  if (input.current == null) return line(null, input.months, input.label);
  if (input.priorAnnual == null || !(input.priorAnnual > 0) || input.priorSame == null || !(input.priorSame > 0)) {
    linear.gaps.unshift(`سهم ${input.label} این دوره از سال پارسال مثبت نیست و پیش‌بینی خطی شد.`);
    return linear;
  }
  const raw = input.priorSame / input.priorAnnual;
  const share = clampShare(raw);
  const gaps: string[] = [];
  if (share !== raw) {
    gaps.push(`سهم ${input.label} این دوره ${formatNumber(raw, 2)} بود و به ${formatNumber(share, 2)} محدود شد.`);
  }
  return { forecast: input.current / share, share, method: "seasonal", gaps };
}

export function seasonalForecast(periods: TrendPeriod[]): SeasonalForecast {
  const resolved = resolveCumulatives(periods);
  const latest = latestCumulative(resolved.rows);
  if (!latest.row) {
    const gaps = [...resolved.gaps];
    if (latest.gap) gaps.push(latest.gap);
    const empty = (): ForecastLine => ({ forecast: null, share: null, method: null, gaps: [...gaps] });
    return { sales: empty(), fisProfit: empty(), eps: empty() };
  }
  const current = latest.row;
  if (current.months >= 12) {
    const withResolved = (line: ForecastLine): ForecastLine => ({ ...line, gaps: [...resolved.gaps, ...line.gaps] });
    return {
      sales: withResolved({ forecast: current.sales, share: current.sales == null ? null : 1, method: current.sales == null ? null : "seasonal", gaps: current.sales == null ? ["فروش دورهٔ جاری موجود نیست."] : [] }),
      fisProfit: withResolved({
        forecast: statementProfit(current),
        share: statementProfit(current) == null ? null : 1,
        method: statementProfit(current) == null ? null : "seasonal",
        gaps: statementProfit(current) == null ? ["سود FIS دورهٔ جاری موجود نیست."] : [],
      }),
      eps: withResolved({ forecast: current.periodEps, share: current.periodEps == null ? null : 1, method: current.periodEps == null ? null : "seasonal", gaps: current.periodEps == null ? ["سود هر سهم دورهٔ جاری موجود نیست."] : [] }),
    };
  }
  const priorYear = shiftFiscalYear(current.fiscalYearEnd, -1);
  const annual = priorYear ? findCumulative(resolved.rows, priorYear, 12).row : null;
  const prior = priorYear ? findCumulative(resolved.rows, priorYear, current.months).row : null;
  const missing = !annual || !prior;
  const forecast = {
    sales: forecastField({
      label: "فروش",
      current: current.sales,
      months: current.months,
      priorSame: prior?.sales ?? null,
      priorAnnual: annual?.sales ?? null,
      missingBase: missing || prior?.sales == null || annual?.sales == null,
    }),
    fisProfit: forecastField({
      label: "سود FIS",
      current: statementProfit(current),
      months: current.months,
      priorSame: prior ? statementProfit(prior) : null,
      priorAnnual: annual ? statementProfit(annual) : null,
      missingBase: missing || (prior != null && statementProfit(prior) == null) || (annual != null && statementProfit(annual) == null),
    }),
    eps: forecastField({
      label: "سود هر سهم",
      current: current.periodEps,
      months: current.months,
      priorSame: prior?.periodEps ?? null,
      priorAnnual: annual?.periodEps ?? null,
      missingBase: missing || prior?.periodEps == null || annual?.periodEps == null,
    }),
  };
  if (resolved.gaps.length === 0) return forecast;
  const attach = (line: ForecastLine): ForecastLine => ({ ...line, gaps: [...resolved.gaps, ...line.gaps] });
  return { sales: attach(forecast.sales), fisProfit: attach(forecast.fisProfit), eps: attach(forecast.eps) };
}

export function seasonalForwardPe(periods: TrendPeriod[], price: number | null): { forwardPe: number | null; gaps: string[] } {
  const forecast = seasonalForecast(periods);
  const gaps = [...forecast.eps.gaps];
  if (price == null || !(price > 0)) {
    gaps.push("قیمت برای نسبت آینده‌نگر فصلی موجود نیست.");
    return { forwardPe: null, gaps };
  }
  if (forecast.eps.forecast == null) return { forwardPe: null, gaps };
  if (!(forecast.eps.forecast > 0)) {
    gaps.push("سود هر سهم پیش‌بینی‌شده برای نسبت فصلی مثبت نیست.");
    return { forwardPe: null, gaps };
  }
  return { forwardPe: price / forecast.eps.forecast, gaps };
}
