import type { StatementFigures } from "@/lib/finance/codal/parse";
import type { SalesPoint } from "@/lib/finance/codal/parse";
import {
  annualize,
  fisProfit,
  growthPercent,
  marginPercent,
  periodDays,
  salesGrowth,
  sharesFromEarnings,
  type FisObservation,
} from "@/lib/finance/fis";

export function priorYearPeriod(period: string): string | null {
  const match = /^(\d{4})\/(\d{2}\/\d{2})$/.exec(period);
  if (!match) return null;
  return `${Number(match[1]) - 1}/${match[2]}`;
}

export function monthlySalesGrowth(points: SalesPoint[], period: string | null): number | null {
  if (!period) return null;
  const previous = priorYearPeriod(period);
  if (!previous) return null;
  const current = points.find((point) => point.period === period)?.sales ?? null;
  const last = points.find((point) => point.period === previous)?.sales ?? null;
  return salesGrowth(current, last);
}

function scaledAmount(amount: number | null, netIncome: number | null, periodEps: number | null): number | null {
  if (amount == null) return null;
  const shares = sharesFromEarnings(netIncome, periodEps);
  if (shares == null || netIncome == null || periodEps == null || periodEps === 0) return null;
  const scale = Math.abs(netIncome / periodEps) < 100_000 ? 1_000_000 : 1;
  return (amount * scale) / shares;
}

export function buildFisObservation(input: {
  price: number | null;
  months: number | null;
  current: StatementFigures | null;
  prior: StatementFigures | null;
  priorMonths: number | null;
  sameFiscalYear: boolean;
  salesPoints: SalesPoint[];
  period: string | null;
  fiscalYearScore: 0 | 3 | 5 | null;
  ttmEps: number | null;
  owned: boolean;
  previousScore: number | null;
  statementSalesGrowthPercent?: number | null;
  dividendRatioPercent?: number | null;
}): FisObservation {
  const gaps: string[] = [];
  const current = input.current;
  const profit = fisProfit(current?.operatingProfit ?? null, current?.otherOperatingIncome ?? null);
  if (profit.operatingOnly && profit.profit != null) gaps.push("سایر درآمد عملیاتی جدا نشد و سود عملیاتی به‌جای سود FIS نشست.");
  const sales = current?.sales ?? null;
  const months = input.months;
  const reliable = months != null && months >= 3 && sales != null && sales > 0;
  const loss = (profit.profit != null && profit.profit <= 0) || (sales != null && sales <= 0);
  const shares = sharesFromEarnings(current?.netIncome ?? null, current?.periodEps ?? null);
  const forwardProfit = annualize(profit.profit, months);
  const forwardSales = annualize(sales, months);
  const forwardEps = shares == null ? null : scaledAmount(forwardProfit, current?.netIncome ?? null, current?.periodEps ?? null);
  const salesPerShare = shares == null ? null : scaledAmount(forwardSales, current?.netIncome ?? null, current?.periodEps ?? null);
  const price = input.price;
  const forwardPe = price != null && forwardEps != null && forwardEps > 0 && price > 0 ? price / forwardEps : null;
  const forwardPs = price != null && salesPerShare != null && salesPerShare > 0 && price > 0 ? price / salesPerShare : null;
  const ttmPe = price != null && input.ttmEps != null && input.ttmEps > 0 && price > 0 ? price / input.ttmEps : null;
  const expectation = forwardPe != null && ttmPe != null && ttmPe > 0
    ? (Math.abs(forwardPe - ttmPe) / ttmPe) * 100
    : null;
  if (input.ttmEps != null && expectation != null) gaps.push("شکاف انتظارات با سود هر سهم ذخیره‌شده از بازار حساب شد.");

  const growth = input.statementSalesGrowthPercent != null
    ? input.statementSalesGrowthPercent
    : monthlySalesGrowth(input.salesPoints, input.period);
  if (input.statementSalesGrowthPercent != null) gaps.push("رشد فروش از فروش تجمعی همین دوره نسبت به دوره مشابه پارسال است.");
  else if (growth != null) gaps.push("رشد فروش از همان ماه نسبت به ماه مشابه پارسال است.");

  let marginGrowth: number | null = null;
  const currentMargin = marginPercent(profit.profit, sales);
  if (
    input.sameFiscalYear
    && input.prior
    && input.priorMonths != null
    && months != null
    && months > input.priorMonths
  ) {
    const priorProfit = fisProfit(input.prior.operatingProfit, input.prior.otherOperatingIncome).profit;
    const quarterSales = sales != null && input.prior.sales != null ? sales - input.prior.sales : null;
    const quarterProfit = profit.profit != null && priorProfit != null ? profit.profit - priorProfit : null;
    const quarterMargin = marginPercent(quarterProfit, quarterSales);
    const priorMargin = marginPercent(priorProfit, input.prior.sales);
    marginGrowth = growthPercent(quarterMargin, priorMargin);
  }

  const days = periodDays(months);
  const collection = current?.receivables != null && sales != null && sales > 0 && days != null
    ? (current.receivables / sales) * days
    : null;
  const averageInventory = current?.inventory != null && current.priorInventory != null
    ? (current.inventory + current.priorInventory) / 2
    : null;
  const cogs = current?.cogs == null ? null : Math.abs(current.cogs);
  const inventoryDays = averageInventory != null && cogs != null && cogs > 0 && days != null
    ? (averageInventory / cogs) * days
    : null;
  const receivablesRatio = current?.receivables != null && current.totalAssets != null && current.totalAssets > 0
    ? (current.receivables / current.totalAssets) * 100
    : null;

  return {
    forwardPe,
    salesGrowthPercent: growth,
    marginPercent: currentMargin,
    marginGrowthPercent: marginGrowth,
    forwardPs,
    dividendRatioPercent: input.dividendRatioPercent ?? null,
    receivablesToAssetsPercent: receivablesRatio,
    expectationGapPercent: expectation,
    collectionDays: collection,
    inventoryDays,
    fiscalYearScore: input.fiscalYearScore,
    lossMaking: loss,
    forecastReliable: reliable,
    forecastAbsent: current == null,
    owned: input.owned,
    previousScore: input.previousScore,
    gaps,
  };
}
