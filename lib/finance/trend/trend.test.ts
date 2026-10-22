import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/finance/format";
import { annualize } from "@/lib/finance/fis";
import { discreteQuarters } from "@/lib/finance/trend/discrete";
import { groupTrendRows } from "@/lib/finance/trend/read";
import { seasonalForecast, seasonalForwardPe } from "@/lib/finance/trend/seasonal";
import { fiscalYearEnd } from "@/lib/finance/trend/series";
import { ttm } from "@/lib/finance/trend/ttm";
import type { TrendPeriod } from "@/lib/finance/trend/series";
import { trendVerdict } from "@/lib/finance/trend/verdict";
import { yoyByQuarter } from "@/lib/finance/trend/yoy";
import type { DiscreteQuarter } from "@/lib/finance/trend/discrete";

function period(input: Partial<TrendPeriod> & { period: string; months: number }): TrendPeriod {
  return {
    period: input.period,
    months: input.months,
    tracingNo: input.tracingNo ?? `${input.period}:${input.months}`,
    revisionOf: input.revisionOf ?? null,
    sales: input.sales ?? null,
    netIncome: input.netIncome ?? null,
    operatingProfit: input.operatingProfit ?? null,
    otherOperatingIncome: input.otherOperatingIncome ?? null,
    periodEps: input.periodEps ?? null,
  };
}

function flatYear(yearEnd: string, dates: [string, string, string, string], perQuarter: { sales: number; profit: number; other: number; eps: number }): TrendPeriod[] {
  const rows: TrendPeriod[] = [];
  let sales = 0;
  let operating = 0;
  let other = 0;
  let eps = 0;
  dates.forEach((date, index) => {
    sales += perQuarter.sales;
    operating += perQuarter.profit + perQuarter.other;
    other += perQuarter.other;
    eps += perQuarter.eps;
    rows.push(period({
      period: date,
      months: (index + 1) * 3,
      sales,
      operatingProfit: operating,
      otherOperatingIncome: other,
      periodEps: eps,
      netIncome: eps,
    }));
  });
  expect(fiscalYearEnd(dates[3] ?? "", 12)).toBe(yearEnd);
  return rows;
}

const evenYears = [
  ...flatYear("1403/12/30", ["1403/03/31", "1403/06/31", "1403/09/30", "1403/12/30"], { sales: 80, profit: 24, other: 8, eps: 8 }),
  ...flatYear("1404/12/29", ["1404/03/31", "1404/06/31", "1404/09/30", "1404/12/29"], { sales: 100, profit: 30, other: 10, eps: 10 }),
];

function seasonalYears(): TrendPeriod[] {
  const prior = [
    [3, "1402/09/30", 40, 16, 4, 4],
    [6, "1402/12/29", 90, 36, 8, 9],
    [9, "1403/03/31", 160, 64, 16, 16],
    [12, "1403/06/31", 400, 160, 40, 40],
  ] as const;
  const current = [
    [3, "1403/09/30", 80, 32, 8, 8],
    [6, "1403/12/30", 140, 56, 14, 14],
    [9, "1404/03/31", 200, 80, 20, 20],
    [12, "1404/06/31", 490, 196, 49, 49],
  ] as const;
  return [...prior, ...current].map(([months, date, sales, operating, other, eps]) => period({
    period: date,
    months,
    sales,
    operatingProfit: operating,
    otherOperatingIncome: other,
    periodEps: eps,
    netIncome: eps,
  }));
}

function quarter(input: Partial<DiscreteQuarter> & { fiscalYearEnd: string; quarter: 1 | 2 | 3 | 4; period: string }): DiscreteQuarter {
  return {
    fiscalYearEnd: input.fiscalYearEnd,
    quarter: input.quarter,
    period: input.period,
    throughMonths: (input.quarter * 3) as 3 | 6 | 9 | 12,
    sales: input.sales ?? null,
    fisProfit: input.fisProfit ?? null,
    marginPercent: input.marginPercent ?? null,
    eps: input.eps ?? null,
    gaps: input.gaps ?? [],
  };
}

describe("discreteQuarters", () => {
  it("splits a flat Esfand year into four equal quarters", () => {
    const result = discreteQuarters(evenYears.filter((row) => row.period.startsWith("1404/")));
    expect(result.quarters.map((item) => item.sales)).toEqual([100, 100, 100, 100]);
    expect(result.quarters.map((item) => item.fisProfit)).toEqual([30, 30, 30, 30]);
    expect(result.quarters.map((item) => item.eps)).toEqual([10, 10, 10, 10]);
    expect(result.quarters[1]?.marginPercent).toBe(30);
    expect(result.quarters.every((item) => item.fiscalYearEnd === "1404/12/29")).toBe(true);
  });

  it("keeps a Shahrivar year together and subtracts the prior cumulative", () => {
    const result = discreteQuarters(seasonalYears().filter((row) => fiscalYearEnd(row.period, row.months) === "1404/06/31"));
    expect(result.quarters.map((item) => item.fiscalYearEnd)).toEqual(["1404/06/31", "1404/06/31", "1404/06/31", "1404/06/31"]);
    expect(result.quarters.map((item) => item.sales)).toEqual([80, 60, 60, 290]);
    expect(result.quarters[3]?.period).toBe("1404/06/31");
  });

  it("lets the newer revision replace the original filing", () => {
    const result = discreteQuarters([
      period({ period: "1404/03/31", months: 3, tracingNo: "4", sales: 100, operatingProfit: 40, otherOperatingIncome: 10, periodEps: 10 }),
      period({ period: "1404/03/31", months: 3, tracingNo: "6", revisionOf: "4", sales: 110, operatingProfit: 44, otherOperatingIncome: 10, periodEps: 11 }),
      period({ period: "1404/06/31", months: 6, tracingNo: "5", sales: 250, operatingProfit: 100, otherOperatingIncome: 20, periodEps: 25 }),
    ]);
    expect(result.quarters.map((item) => item.sales)).toEqual([110, 140]);
    expect(result.quarters[1]?.eps).toBe(14);
  });

  it("returns null when the prior cumulative or the revision chain is missing", () => {
    const missing = discreteQuarters([
      period({ period: "1404/06/31", months: 6, sales: 200, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 20 }),
    ]);
    expect(missing.quarters[0]?.sales).toBeNull();
    expect(missing.gaps.join(" ")).toContain(formatNumber(3));

    const ambiguous = discreteQuarters([
      period({ period: "1404/03/31", months: 3, tracingNo: "4", sales: 100, operatingProfit: 40, otherOperatingIncome: 10, periodEps: 10 }),
      period({ period: "1404/03/31", months: 3, tracingNo: "6", revisionOf: "4", sales: 110, operatingProfit: 40, otherOperatingIncome: 10, periodEps: 11 }),
      period({ period: "1404/03/31", months: 3, tracingNo: "7", revisionOf: "4", sales: 120, operatingProfit: 40, otherOperatingIncome: 10, periodEps: 12 }),
    ]);
    expect(ambiguous.quarters).toEqual([]);
    expect(ambiguous.gaps.join(" ")).toContain("چند اصلاحیه");
    expect(fiscalYearEnd("1404/12/30", 12)).toBeNull();
  });
});

describe("ttm", () => {
  it("rolls the latest annual with the current cumulative and last year's same period", () => {
    const result = ttm([
      period({ period: "1403/06/31", months: 6, sales: 500, operatingProfit: 200, otherOperatingIncome: 40, periodEps: 16 }),
      period({ period: "1403/12/30", months: 12, sales: 1200, operatingProfit: 500, otherOperatingIncome: 100, periodEps: 40 }),
      period({ period: "1404/06/31", months: 6, sales: 700, operatingProfit: 280, otherOperatingIncome: 40, periodEps: 24 }),
    ]);
    expect(result.sales).toBe(1400);
    expect(result.fisProfit).toBe(480);
    expect(result.eps).toBe(48);
  });

  it("keeps an uneven seasonal year on the same roll instead of spreading it flat", () => {
    const rows = seasonalYears().filter((row) => row.period !== "1404/06/31" && (row.months === 12 || row.months === 9));
    const result = ttm(rows);
    expect(result.sales).toBe(440);
    expect(annualize(200, 9)).toBeCloseTo(266.6667, 3);
  });

  it("uses the annual itself when it is the latest statement and stays empty when last year is missing", () => {
    expect(ttm([period({ period: "1403/12/30", months: 12, sales: 400, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 40 })]).sales).toBe(400);
    const missing = ttm([period({ period: "1404/06/31", months: 6, sales: 700, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 24 })]);
    expect(missing.sales).toBeNull();
    expect(missing.gaps.join(" ")).toContain("دوازده ماه گذشته");
  });
});

describe("yoyByQuarter", () => {
  it("measures each flat quarter against the same quarter last year", () => {
    const growth = yoyByQuarter(discreteQuarters(evenYears).quarters).filter((item) => item.fiscalYearEnd === "1404/12/29");
    expect(growth.map((item) => item.salesGrowthPercent)).toEqual([25, 25, 25, 25]);
    expect(growth.map((item) => item.fisProfitGrowthPercent)).toEqual([25, 25, 25, 25]);
    expect(growth.map((item) => item.marginGrowthPercent)).toEqual([0, 0, 0, 0]);
    expect(growth.map((item) => item.epsGrowthPercent)).toEqual([25, 25, 25, 25]);
  });

  it("lets a seasonal company grow differently in the first and last quarter", () => {
    const growth = yoyByQuarter(discreteQuarters(seasonalYears()).quarters).filter((item) => item.fiscalYearEnd === "1404/06/31");
    expect(growth[0]?.salesGrowthPercent).toBe(100);
    expect(growth[3]?.salesGrowthPercent).toBeCloseTo(20.8333, 3);
  });

  it("returns null growth when the same quarter last year is absent", () => {
    const growth = yoyByQuarter(discreteQuarters(evenYears.filter((row) => row.period.startsWith("1404/"))).quarters);
    expect(growth[0]?.salesGrowthPercent).toBeNull();
    expect(growth[0]?.gaps.join(" ")).toContain("1403/12/30");
  });
});

describe("seasonalForecast", () => {
  it("scales the current cumulative by last year's own share of the year", () => {
    const rows = seasonalYears().filter((row) => row.period !== "1404/06/31" && (row.months === 12 || row.months === 9));
    const forecast = seasonalForecast(rows);
    expect(forecast.sales.share).toBeCloseTo(0.4, 6);
    expect(forecast.sales.forecast).toBe(500);
    expect(forecast.sales.method).toBe("seasonal");
    expect(annualize(200, 9)).toBeCloseTo(266.6667, 3);
    const priced = seasonalForwardPe(rows, 250);
    expect(priced.forwardPe).toBe(5);
    expect(250 / (annualize(20, 9) ?? 1)).toBe(9.375);
  });

  it("matches linear annualizing when last year was spread evenly", () => {
    const forecast = seasonalForecast(evenYears.filter((row) => row.period !== "1404/12/29" && (row.months === 12 || row.months === 6)));
    expect(forecast.sales.forecast).toBe(400);
    expect(forecast.sales.forecast).toBe(annualize(200, 6));
  });

  it("clamps the share and falls back to linear when last year is missing or not positive", () => {
    const clamped = seasonalForecast([
      period({ period: "1403/06/31", months: 6, sales: 20, operatingProfit: 8, otherOperatingIncome: 2, periodEps: 2 }),
      period({ period: "1403/12/30", months: 12, sales: 400, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 40 }),
      period({ period: "1404/06/31", months: 6, sales: 30, operatingProfit: 12, otherOperatingIncome: 3, periodEps: 3 }),
    ]);
    expect(clamped.sales.share).toBe(0.1);
    expect(clamped.sales.forecast).toBe(300);
    expect(clamped.sales.gaps.join(" ")).toContain(formatNumber(0.05, 2));

    const missing = seasonalForecast([
      period({ period: "1404/06/31", months: 6, sales: 220, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 22 }),
    ]);
    expect(missing.sales.method).toBe("linear");
    expect(missing.sales.forecast).toBe(440);
    expect(missing.sales.gaps.join(" ")).toContain("پیش‌بینی خطی");

    const negative = seasonalForecast([
      period({ period: "1403/06/31", months: 6, sales: -10, operatingProfit: 8, otherOperatingIncome: 2, periodEps: 2 }),
      period({ period: "1403/12/30", months: 12, sales: 400, operatingProfit: 80, otherOperatingIncome: 20, periodEps: 40 }),
      period({ period: "1404/06/31", months: 6, sales: 100, operatingProfit: 40, otherOperatingIncome: 10, periodEps: 10 }),
    ]);
    expect(negative.sales.method).toBe("linear");
    expect(negative.sales.forecast).toBe(200);
  });
});

describe("trendVerdict", () => {
  it("scores the last two flat quarters against last year", () => {
    const result = trendVerdict(discreteQuarters(evenYears).quarters, 25);
    expect(result.verdict).toBe("stable");
    expect(result.label).toBe("ثابت");
    expect(result.sum).toBe(1);
    expect(result.signals.map((signal) => signal.score)).toEqual([0, 0, 1]);
    expect(result.currentPeriods).toEqual(["1404/09/30", "1404/12/29"]);
  });

  it("calls a seasonal pair improving when sales and EPS rise and the margin holds", () => {
    const result = trendVerdict([
      quarter({ fiscalYearEnd: "1403/06/31", quarter: 3, period: "1403/03/31", sales: 100, fisProfit: 30, marginPercent: 30, eps: 10 }),
      quarter({ fiscalYearEnd: "1403/06/31", quarter: 4, period: "1403/06/31", sales: 200, fisProfit: 60, marginPercent: 30, eps: 20 }),
      quarter({ fiscalYearEnd: "1404/06/31", quarter: 3, period: "1404/03/31", sales: 120, fisProfit: 36, marginPercent: 30, eps: 12 }),
      quarter({ fiscalYearEnd: "1404/06/31", quarter: 4, period: "1404/06/31", sales: 280, fisProfit: 84, marginPercent: 30, eps: 28 }),
    ], 10);
    expect(result.currentPeriods).toEqual(["1404/03/31", "1404/06/31"]);
    expect(result.signals.map((signal) => signal.score)).toEqual([1, 0, 1]);
    expect(result.sum).toBe(2);
    expect(result.verdict).toBe("improving");
    expect(result.label).toBe("بهبود");
  });

  it("returns no verdict when inflation or a neighboring quarter is missing", () => {
    const quarters = discreteQuarters(evenYears).quarters;
    const withoutInflation = trendVerdict(quarters, null);
    expect(withoutInflation.verdict).toBeNull();
    expect(withoutInflation.signals[0]?.score).toBeNull();

    const skipped = trendVerdict([
      quarter({ fiscalYearEnd: "1404/12/29", quarter: 1, period: "1404/03/31", sales: 100, fisProfit: 30, marginPercent: 30, eps: 10 }),
      quarter({ fiscalYearEnd: "1404/12/29", quarter: 3, period: "1404/09/30", sales: 100, fisProfit: 30, marginPercent: 30, eps: 10 }),
    ], 10);
    expect(skipped.verdict).toBeNull();
    expect(skipped.gaps.join(" ")).toContain("پشت سر هم");
  });

  it("reaches worse when the last two Shahrivar quarters all decline", () => {
    const result = trendVerdict([
      quarter({ fiscalYearEnd: "1402/06/31", quarter: 4, period: "1402/06/31", sales: 160, fisProfit: 40, marginPercent: 25, eps: 12 }),
      quarter({ fiscalYearEnd: "1403/06/31", quarter: 1, period: "1402/09/30", sales: 100, fisProfit: 40, marginPercent: 40, eps: 12 }),
      quarter({ fiscalYearEnd: "1403/06/31", quarter: 4, period: "1403/06/31", sales: 100, fisProfit: 40, marginPercent: 40, eps: 12 }),
      quarter({ fiscalYearEnd: "1404/06/31", quarter: 1, period: "1403/09/30", sales: 80, fisProfit: 10, marginPercent: 12.5, eps: 5 }),
    ], 10);
    expect(result.verdict).toBe("worse");
    expect(result.label).toBe("بدتر");
    expect(result.sum).toBe(-3);
    expect(result.signals.map((signal) => signal.score)).toEqual([-1, -1, -1]);
  });
});

describe("groupTrendRows", () => {
  it("reads stored figures and skips a row without an object", () => {
    const grouped = groupTrendRows([
      { symbol: "فولاد", period: "1404/06/31", months: 6, tracingNo: "5", revisionOf: null, figures: { sales: 220, periodEps: "22" } },
      { symbol: "فولاد", period: "1404/03/31", months: 3, tracingNo: "4", revisionOf: null, figures: null },
    ]);
    expect(grouped.bySymbol.get("فولاد")).toEqual([
      period({ period: "1404/06/31", months: 6, tracingNo: "5", sales: 220, periodEps: 22 }),
    ]);
    expect(grouped.gaps.get("فولاد")?.join(" ")).toContain("1404/03/31");
  });
});
