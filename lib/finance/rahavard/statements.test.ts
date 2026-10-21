import { describe, expect, it } from "vitest";
import { parseRahavardFundamentals, statementPeriod } from "@/lib/finance/rahavard/statements";

function income(row: {
  date: string;
  fiscalYear: string;
  period: number;
  capital?: number;
  sales?: number;
  operating?: number;
  other?: number;
  net?: number;
  cogs?: number;
  dividend?: number;
}) {
  const items = [
    row.sales == null ? null : field("Sales Revenue", "درآمد حاصل از خدمات و فروش", row.sales),
    row.operating == null ? null : field("Operating Income", "سود (زیان) عملیاتی", row.operating),
    row.other == null ? null : field("Realized Operational Gains (Losses), Net", "خالص درآمدها و هزینه‌های عملیاتی", row.other),
    row.net == null ? null : field("Net Earnings (Losses)", "سود (زیان) ویژه پس از کسر مالیات", row.net),
    row.cogs == null ? null : field("Cost of Goods Sold (COGS)", "بهای تمام شده کالای فروش رفته", row.cogs),
    row.dividend == null ? null : field("", "سود سهام مصوب سال جاری", row.dividend),
  ].filter((item) => item != null);
  return {
    date: row.date,
    fiscal_year: row.fiscalYear,
    fiscal_period: row.period,
    capital: row.capital ?? null,
    items,
  };
}

function balance(row: {
  date: string;
  fiscalYear: string;
  period: number;
  assets?: number;
  receivables?: number;
  inventory?: number;
  retained?: number;
  equity?: number;
}) {
  return {
    date: row.date,
    fiscal_year: row.fiscalYear,
    fiscal_period: row.period,
    items: [
      row.assets == null ? null : field("Total Assets", "جمع کل دارایی‌ها", row.assets),
      row.receivables == null ? null : field("Institutional Receivables", "حساب‌های اسناد دریافتی تجاری", row.receivables),
      row.inventory == null ? null : field("Inventory", "موجودی مواد و کالا", row.inventory),
      row.retained == null ? null : field("Retained Earnings", "سود و زیان انباشته", row.retained),
      row.equity == null ? null : field("Total Equity", "جمع حقوق صاحبان سهام", row.equity),
    ].filter((item) => item != null),
  };
}

function field(english: string, title: string, value: number) {
  return { field: { english_title: english, title }, value };
}

describe("rahavard statements", () => {
  it("turns a fiscal-year end into the cumulative period end", () => {
    expect(statementPeriod("2026-12-21", 12)).toBe("1405/09/30");
    expect(statementPeriod("2026-12-21", 9)).toBe("1405/06/31");
    expect(statementPeriod("2026-12-21", 6)).toBe("1405/03/31");
    expect(statementPeriod("2026-12-21", 3)).toBe("1404/12/29");
  });

  it("keeps the newer filing, scales rials to million rials, and pairs last year", () => {
    const parsed = parseRahavardFundamentals({
      interim: {
        data: [
          income({
            date: "2026-07-20",
            fiscalYear: "2026-12-21",
            period: 6,
            capital: 5_400_000_000_000,
            sales: 10_608_198_000_000,
            operating: 1,
            net: 1,
          }),
          income({
            date: "2026-09-02",
            fiscalYear: "2026-12-21",
            period: 6,
            capital: 5_400_000_000_000,
            sales: 10_608_198_000_000,
            operating: 2_865_342_000_000,
            other: 286_052_000_000,
            net: 1_783_798_000_000,
            cogs: 7_545_045_000_000,
          }),
          income({
            date: "2026-04-19",
            fiscalYear: "2026-12-21",
            period: 3,
            net: -4_828_000_000,
          }),
          income({
            date: "2026-05-01",
            fiscalYear: "2026-12-21",
            period: 3,
            capital: 5_400_000_000_000,
            sales: 1_000_000_000_000,
            operating: 200_000_000_000,
            net: 100_000_000_000,
          }),
          income({
            date: "2025-09-04",
            fiscalYear: "2025-12-21",
            period: 6,
            capital: 5_400_000_000_000,
            sales: 2_722_392_000_000,
            operating: 920_453_000_000,
            net: 748_773_000_000,
          }),
        ],
      },
      annual: {
        data: [
          income({
            date: "2026-02-17",
            fiscalYear: "2025-12-21",
            period: 0,
            capital: 5_400_000_000_000,
            sales: 64_369_377_000_000,
            net: 50_287_149_000_000,
            dividend: 49_950_000_000_000,
          }),
          income({
            date: "2026-02-03",
            fiscalYear: "2024-12-20",
            period: 12,
            capital: 5_400_000_000_000,
            sales: 35_858_028_000_000,
            net: 29_248_049_000_000,
          }),
          income({
            date: "2025-04-14",
            fiscalYear: "2024-12-20",
            period: 0,
            capital: 5_400_000_000_000,
            sales: 11_618_949_000_000,
            net: 29_160_247_000_000,
            dividend: 25_380_000_000_000,
          }),
        ],
      },
      balance: {
        data: [
          balance({
            date: "2026-09-02",
            fiscalYear: "2026-12-21",
            period: 6,
            assets: 23_886_811_000_000,
            receivables: 8_254_816_000_000,
            inventory: 2_973_748_000_000,
            retained: 8_298_688_000_000,
            equity: 12_000_000_000_000,
          }),
          balance({
            date: "2026-09-02",
            fiscalYear: "2025-12-21",
            period: 12,
            inventory: 1_419_882_000_000,
            retained: 56_334_567_000_000,
          }),
          balance({
            date: "2025-04-14",
            fiscalYear: "2024-12-20",
            period: 12,
            retained: 31_339_616_000_000,
          }),
        ],
      },
      asset: { data: { eps: { pure_ttm: 9503 } } },
    });

    expect(parsed.error).toBeNull();
    expect(parsed.current).toMatchObject({
      months: 6,
      period: "1405/03/31",
      figures: {
        sales: 10_608_198,
        operatingProfit: 2_865_342,
        otherOperatingIncome: 286_052,
        netIncome: 1_783_798,
        cogs: 7_545_045,
        totalAssets: 23_886_811,
        receivables: 8_254_816,
        inventory: 2_973_748,
        priorInventory: 1_419_882,
        priorPeriodSales: 2_722_392,
        equity: 12_000_000,
      },
    });
    expect(parsed.current?.figures.periodEps).toBeCloseTo(330.333, 2);
    expect(parsed.prior).toMatchObject({ months: 3, period: "1404/12/29", figures: { sales: 1_000_000 } });
    expect(parsed.statementSalesGrowth).toBeCloseTo(289.665, 2);
    expect(parsed.dividendRatio).toBeCloseTo(84.825, 2);
    expect(parsed.ttmEps).toBe(9503);
    expect(parsed.olderPeriods.map((item) => item.period.slice(5))).toEqual(["09/30", "09/30"]);
  });
});
