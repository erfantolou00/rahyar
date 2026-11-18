export const FIS_PROPOSAL_VERSION = "rahyar-fis-proposal-2026-10-21";

const INFLATION_FALLBACK = 40;

export type FisStatus = "enter" | "hold" | "exit" | "watch" | "excluded";

export type FisFactorKey =
  | "forward_pe"
  | "sales_growth"
  | "margin"
  | "margin_growth"
  | "forward_ps"
  | "dividend"
  | "receivables"
  | "expectation_gap"
  | "collection_days"
  | "inventory_days"
  | "fiscal_year";

export type FisFactor = {
  key: FisFactorKey;
  label: string;
  max: number;
  score: number;
  value: number | null;
  note: string | null;
};

export type FisObservation = {
  forwardPe: number | null;
  salesGrowthPercent: number | null;
  marginPercent: number | null;
  marginGrowthPercent: number | null;
  forwardPs: number | null;
  dividendRatioPercent: number | null;
  receivablesToAssetsPercent: number | null;
  expectationGapPercent: number | null;
  collectionDays: number | null;
  inventoryDays: number | null;
  fiscalYearScore: 0 | 3 | 5 | null;
  lossMaking: boolean;
  forecastReliable: boolean;
  forecastAbsent: boolean;
  owned: boolean;
  previousScore: number | null;
  gaps: string[];
};

export type FisAssessment = {
  status: FisStatus;
  score: number | null;
  reason: string;
  factors: FisFactor[];
  buyPe: number | null;
  exitPe: number | null;
};

const labels: Record<FisFactorKey, string> = {
  forward_pe: "نسبت قیمت به سود آینده‌نگر",
  sales_growth: "رشد فروش تجمعی",
  margin: "حاشیه سود",
  margin_growth: "رشد روند حاشیه سود",
  forward_ps: "نسبت قیمت به فروش آینده‌نگر",
  dividend: "نسبت تقسیم سود",
  receivables: "مطالبات به دارایی",
  expectation_gap: "شکاف انتظارات سود",
  collection_days: "دوره وصول مطالبات",
  inventory_days: "دوره گردش کالا",
  fiscal_year: "سال مالی",
};

function atMost(value: number, bands: { max: number; score: number }[], above: number): number {
  for (const band of bands) {
    if (value <= band.max) return band.score;
  }
  return above;
}

function atLeast(value: number, bands: { min: number; score: number }[], below: number): number {
  for (const band of bands) {
    if (value >= band.min) return band.score;
  }
  return below;
}

export function valuationBands(akhzaPercent: number): { buyPe: number; exitPe: number } | null {
  if (!(akhzaPercent > 0)) return null;
  const rate = akhzaPercent / 100;
  return { buyPe: 1.5 / rate, exitPe: 3 / rate };
}

function factor(
  key: FisFactorKey,
  max: number,
  score: number,
  value: number | null,
  note: string | null,
): FisFactor {
  return { key, label: labels[key], max, score, value, note };
}

function scoreForwardPe(pe: number | null, akhzaPercent: number): FisFactor {
  const bands = valuationBands(akhzaPercent);
  if (pe == null || !(pe > 0) || !bands) {
    return factor("forward_pe", 15, 0, pe, "سود آینده‌نگر یا نرخ اخزا برای این نسبت کافی نیست.");
  }
  const scale = pe * (akhzaPercent / 100);
  const score = atMost(scale, [
    { max: 1.25, score: 15 },
    { max: 1.5, score: 12 },
    { max: 2.25, score: 8 },
    { max: 3, score: 4 },
  ], 0);
  return factor("forward_pe", 15, score, pe, null);
}

function scoreSales(growth: number | null, inflation: number | null): { factor: FisFactor; fallback: boolean } {
  const fallback = inflation == null;
  const used = inflation ?? INFLATION_FALLBACK;
  if (growth == null) {
    return {
      fallback,
      factor: factor("sales_growth", 15, 0, null, "فروش دوره مشابه سال قبل موجود نیست."),
    };
  }
  const excess = growth - used;
  const score = atLeast(excess, [
    { min: 20, score: 15 },
    { min: 10, score: 11 },
    { min: 0, score: 7 },
    { min: -10, score: 3 },
  ], 0);
  return {
    fallback,
    factor: factor(
      "sales_growth",
      15,
      score,
      excess,
      fallback ? "تورم دوازده‌ماهه نبود و ۴۰ درصد به‌جای آن نشست." : null,
    ),
  };
}

function scoreMargin(margin: number | null): FisFactor {
  if (margin == null) return factor("margin", 10, 0, null, "سود FIS یا درآمد عملیاتی موجود نیست.");
  const score = atLeast(margin, [
    { min: 25, score: 10 },
    { min: 15, score: 7 },
    { min: 8, score: 4 },
    { min: 3, score: 2 },
  ], 0);
  return factor("margin", 10, score, margin, null);
}

function scoreMarginGrowth(growth: number | null): FisFactor {
  if (growth == null) {
    return factor("margin_growth", 10, 0, null, "حاشیه فصل قبل برای رشد فصل‌به‌فصل موجود نیست.");
  }
  const score = atLeast(growth, [
    { min: 10, score: 10 },
    { min: 0, score: 6 },
    { min: -10, score: 3 },
  ], 0);
  return factor("margin_growth", 10, score, growth, null);
}

function scoreForwardPs(ps: number | null, akhzaPercent: number): FisFactor {
  if (ps == null || !(ps > 0) || !(akhzaPercent > 0)) {
    return factor("forward_ps", 10, 0, ps, "فروش آینده‌نگر یا نرخ اخزا برای این نسبت کافی نیست.");
  }
  const scale = (ps * (akhzaPercent / 100)) / 0.15;
  const score = atMost(scale, [
    { max: 1.25, score: 10 },
    { max: 1.5, score: 8 },
    { max: 2.25, score: 5 },
    { max: 3, score: 2 },
  ], 0);
  return factor("forward_ps", 10, score, ps, null);
}

function scoreDividend(ratio: number | null): FisFactor {
  if (ratio == null) {
    return factor("dividend", 10, 0, null, "سود تقسیمی دو سال آخر در صورت‌ها پیدا نشد.");
  }
  if (ratio <= 0 || ratio > 80) {
    return factor("dividend", 10, 0, ratio, "سود انباشته نامثبت است یا نسبت تقسیم سود خارج از صفر تا ۸۰ درصد است.");
  }
  if (ratio >= 20 && ratio <= 50) return factor("dividend", 10, 10, ratio, null);
  if ((ratio >= 10 && ratio < 20) || (ratio > 50 && ratio <= 80)) return factor("dividend", 10, 6, ratio, null);
  return factor("dividend", 10, 3, ratio, null);
}

function scoreReceivables(ratio: number | null): FisFactor {
  if (ratio == null || ratio < 0) return factor("receivables", 10, 0, ratio, "مطالبات یا جمع دارایی‌ها موجود نیست.");
  const score = atMost(ratio, [
    { max: 10, score: 10 },
    { max: 20, score: 7 },
    { max: 30, score: 4 },
    { max: 40, score: 2 },
  ], 0);
  return factor("receivables", 10, score, ratio, null);
}

function scoreGap(gap: number | null): FisFactor {
  if (gap == null || gap < 0) return factor("expectation_gap", 5, 0, gap, "سود دوازده‌ماهه برای شکاف انتظارات موجود نیست.");
  const score = atMost(gap, [
    { max: 15, score: 5 },
    { max: 30, score: 3 },
    { max: 50, score: 1 },
  ], 0);
  return factor("expectation_gap", 5, score, gap, null);
}

function scoreDays(
  key: "collection_days" | "inventory_days",
  days: number | null,
  bands: { max: number; score: number }[],
  empty: string,
): FisFactor {
  if (days == null || days < 0) return factor(key, 5, 0, days, empty);
  return factor(key, 5, atMost(days, bands, 0), days, null);
}

function scoreFiscal(value: 0 | 3 | 5 | null): FisFactor {
  if (value == null) {
    return factor("fiscal_year", 5, 0, null, "ثبات پایان سال مالی نسبت به سال قبل معلوم نیست.");
  }
  return factor("fiscal_year", 5, value, value, null);
}

export function assessFis(
  observation: FisObservation,
  akhzaPercent: number,
  inflationPercent: number | null,
): FisAssessment & { inflationFallback: boolean } {
  const bands = valuationBands(akhzaPercent);
  const sales = scoreSales(observation.salesGrowthPercent, inflationPercent);
  const factors = [
    scoreForwardPe(observation.forwardPe, akhzaPercent),
    sales.factor,
    scoreMargin(observation.marginPercent),
    scoreMarginGrowth(observation.marginGrowthPercent),
    scoreForwardPs(observation.forwardPs, akhzaPercent),
    scoreDividend(observation.dividendRatioPercent),
    scoreReceivables(observation.receivablesToAssetsPercent),
    scoreGap(observation.expectationGapPercent),
    scoreDays("collection_days", observation.collectionDays, [
      { max: 45, score: 5 },
      { max: 90, score: 4 },
      { max: 150, score: 2 },
      { max: 210, score: 1 },
    ], "مطالبات یا فروش دوره برای دوره وصول کافی نیست."),
    scoreDays("inventory_days", observation.inventoryDays, [
      { max: 45, score: 5 },
      { max: 90, score: 3 },
      { max: 150, score: 2 },
      { max: 240, score: 1 },
    ], "موجودی ابتدا، بهای تمام‌شده یا روزهای دوره برای گردش کالا کافی نیست."),
    scoreFiscal(observation.fiscalYearScore),
  ];

  if (observation.lossMaking || !observation.forecastReliable) {
    const reason = observation.lossMaking
      ? "سود FIS یا درآمد عملیاتی نامثبت است و سهم پیش از امتیاز حذف می‌شود."
      : observation.forecastAbsent
        ? "صورت مالی برای ساخت پیش‌بینی خوانده نشد و سهم پیش از امتیاز کنار می‌رود."
        : "کمتر از سه ماه از سال مالی گذشته یا فروش همان ماه‌ها موجود نیست.";
    return {
      status: observation.owned ? "exit" : "excluded",
      score: null,
      reason: observation.owned ? `${reason} چون سهم در سبد است، وضعیت خروج است.` : reason,
      factors,
      buyPe: bands?.buyPe ?? null,
      exitPe: bands?.exitPe ?? null,
      inflationFallback: sales.fallback,
    };
  }

  const score = factors.reduce((sum, item) => sum + item.score, 0);
  const pe = observation.forwardPe;
  const inBuy = bands != null && pe != null && pe > 0 && pe <= bands.buyPe;
  const atExit = bands != null && pe != null && pe > 0 && pe >= bands.exitPe;
  const drop = observation.previousScore == null ? null : observation.previousScore - score;

  if (!observation.owned) {
    if (score >= 60 && inBuy) {
      return {
        status: "enter",
        score,
        reason: "امتیاز دست‌کم ۶۰ است و نسبت قیمت به سود آینده‌نگر داخل محدوده خرید است.",
        factors,
        buyPe: bands?.buyPe ?? null,
        exitPe: bands?.exitPe ?? null,
        inflationFallback: sales.fallback,
      };
    }
    return {
      status: "watch",
      score,
      reason: score >= 60
        ? "امتیاز به کف ورود رسیده، ولی قیمت هنوز در محدوده خرید نیست."
        : "امتیاز به کف ۶۰ ورود نرسیده است.",
      factors,
      buyPe: bands?.buyPe ?? null,
      exitPe: bands?.exitPe ?? null,
      inflationFallback: sales.fallback,
    };
  }

  if (score < 45) {
    return baseOwned("exit", score, "امتیاز به زیر ۴۵ رسیده است.", factors, bands, sales.fallback);
  }
  if (drop != null && drop >= 15) {
    return baseOwned("exit", score, "امتیاز نسبت به گزارش قبلی دست‌کم ۱۵ واحد کم شده است.", factors, bands, sales.fallback);
  }
  if (atExit) {
    return baseOwned("exit", score, "نسبت قیمت به سود آینده‌نگر به محدوده خروج رسیده است.", factors, bands, sales.fallback);
  }
  if (score >= 45 && pe != null && bands != null && pe < bands.exitPe) {
    return baseOwned("hold", score, "امتیاز و قیمت هنوز به شرط خروج نرسیده‌اند.", factors, bands, sales.fallback);
  }
  return baseOwned("watch", score, "قیمت آینده‌نگر برای تشخیص نگهداری یا خروج ساخته نشد.", factors, bands, sales.fallback);
}

function baseOwned(
  status: FisStatus,
  score: number,
  reason: string,
  factors: FisFactor[],
  bands: { buyPe: number; exitPe: number } | null,
  inflationFallback: boolean,
): FisAssessment & { inflationFallback: boolean } {
  return {
    status,
    score,
    reason,
    factors,
    buyPe: bands?.buyPe ?? null,
    exitPe: bands?.exitPe ?? null,
    inflationFallback,
  };
}

export function payoutPercent(
  dividendPerShare: number | null,
  netIncome: number | null,
  periodEps: number | null,
  retainedEarnings: number | null,
): number | null {
  const shares = sharesFromEarnings(netIncome, periodEps);
  if (shares == null || dividendPerShare == null || retainedEarnings == null || !(dividendPerShare > 0) || !(retainedEarnings > 0) || netIncome == null || periodEps == null || periodEps === 0) {
    return null;
  }
  const scale = Math.abs(netIncome / periodEps) < 100_000 ? 1_000_000 : 1;
  return (dividendPerShare * shares) / (retainedEarnings * scale) * 100;
}

export function sharesFromEarnings(netIncome: number | null, periodEps: number | null): number | null {
  if (netIncome == null || periodEps == null || periodEps === 0) return null;
  const raw = netIncome / periodEps;
  if (!(raw > 0)) return null;
  const shares = Math.abs(raw) < 100_000 ? raw * 1_000_000 : raw;
  return shares > 0 ? shares : null;
}

export function annualize(amount: number | null, months: number | null): number | null {
  if (amount == null || months == null || months <= 0) return null;
  if (months >= 12) return amount;
  return (amount * 12) / months;
}

export function fisProfit(
  operatingProfit: number | null,
  otherOperatingIncome: number | null,
): { profit: number | null; operatingOnly: boolean } {
  if (operatingProfit == null) return { profit: null, operatingOnly: false };
  if (otherOperatingIncome == null) return { profit: operatingProfit, operatingOnly: true };
  return { profit: operatingProfit - otherOperatingIncome, operatingOnly: false };
}

export function scoreFiscalYear(months: number | null, annualEndings: string[]): 0 | 3 | 5 | null {
  if (months == null) return null;
  if (months < 6) return 0;
  const endings = annualEndings.filter((item) => /^\d{2}\/\d{2}$/.test(item));
  if (new Set(endings).size > 1) return 0;
  if (endings.length < 2) return null;
  return months >= 9 ? 5 : 3;
}

export function periodDays(months: number | null): number | null {
  if (months == null) return null;
  if (months === 3) return 90;
  if (months === 6) return 180;
  if (months === 9) return 270;
  if (months >= 12) return 365;
  return months * 30;
}

export function salesGrowth(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export function marginPercent(profit: number | null, sales: number | null): number | null {
  if (profit == null || sales == null || !(sales > 0)) return null;
  return (profit / sales) * 100;
}

export function growthPercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}
