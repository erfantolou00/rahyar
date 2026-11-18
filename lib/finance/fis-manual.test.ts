import { describe, expect, it } from "vitest";
import { applyManualSheet, emptyStatement, parseStoredSheet } from "@/lib/finance/fis-manual";

describe("manual FIS sheet", () => {
  it("keeps Codal figures and replaces only the typed sales", () => {
    const base = { ...emptyStatement(), sales: 10, netIncome: 4, totalAssets: 100 };
    const merged = applyManualSheet(base, {
      ...parseStoredSheet({ sales: 25 })!,
      months: null,
      price: null,
      priorPeriodSales: null,
      operatingProfit: null,
      otherOperatingIncome: null,
      netIncome: null,
      periodEps: null,
      cogs: null,
      totalAssets: null,
      receivables: null,
      inventory: null,
      priorInventory: null,
      retainedEarnings: null,
      ttmEps: null,
      dividendRatioPercent: null,
      priorMonths: null,
      priorSales: null,
      priorOperatingProfit: null,
      fiscalYearScore: null,
    });
    expect(merged?.sales).toBe(25);
    expect(merged?.netIncome).toBe(4);
    expect(merged?.totalAssets).toBe(100);
  });

  it("reads a stored sheet and ignores an empty object", () => {
    expect(parseStoredSheet({})).toBeNull();
    expect(parseStoredSheet({ months: 9, sales: 25379857, fiscalYearScore: 5 })?.months).toBe(9);
    expect(parseStoredSheet({ months: 9, sales: 25379857, fiscalYearScore: 5 })?.sales).toBe(25379857);
  });
});
