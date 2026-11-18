import { describe, expect, it } from "vitest";
import {
  assessFis,
  fisProfit,
  payoutPercent,
  salesGrowth,
  scoreFiscalYear,
  sharesFromEarnings,
  valuationBands,
  type FisObservation,
} from "@/lib/finance/fis";

function observation(overrides: Partial<FisObservation> = {}): FisObservation {
  return {
    forwardPe: 3.5,
    salesGrowthPercent: 60,
    marginPercent: 20,
    marginGrowthPercent: 12,
    forwardPs: 0.4,
    dividendRatioPercent: 30,
    receivablesToAssetsPercent: 8,
    expectationGapPercent: 10,
    collectionDays: 40,
    inventoryDays: 40,
    fiscalYearScore: 5,
    lossMaking: false,
    forecastReliable: true,
    forecastAbsent: false,
    owned: false,
    previousScore: null,
    gaps: [],
    ...overrides,
  };
}

describe("valuation bands", () => {
  it("reproduces the paper example at a 40 percent akhza rate", () => {
    expect(valuationBands(40)).toEqual({ buyPe: 3.75, exitPe: 7.5 });
  });
});

describe("assessFis", () => {
  it("gives the forward P/E ceilings at a 40 percent akhza rate", () => {
    const scoreOf = (forwardPe: number) =>
      assessFis(observation({ forwardPe, owned: true, previousScore: null }), 40, 30).factors[0];
    expect(scoreOf(3.125)?.score).toBe(15);
    expect(scoreOf(3.75)?.score).toBe(12);
    expect(scoreOf(5.625)?.score).toBe(8);
    expect(scoreOf(7.5)?.score).toBe(4);
    expect(scoreOf(7.51)?.score).toBe(0);
  });

  it("enters only when the score and the buy band both pass", () => {
    const entered = assessFis(observation(), 40, 30);
    expect(entered.status).toBe("enter");
    expect(entered.score).toBeGreaterThanOrEqual(60);
    const rich = assessFis(observation({ forwardPe: 6 }), 40, 30);
    expect(rich.status).toBe("watch");
  });

  it("exits an owned share when the forward P/E reaches the exit band", () => {
    const result = assessFis(observation({ owned: true, forwardPe: 7.5, previousScore: 80 }), 40, 30);
    expect(result.status).toBe("exit");
  });

  it("exits an owned share when the score falls by 15 points", () => {
    const current = assessFis(observation({ owned: true, forwardPe: 5 }), 40, 30);
    const result = assessFis(
      observation({ owned: true, forwardPe: 5, previousScore: (current.score ?? 0) + 15 }),
      40,
      30,
    );
    expect(result.status).toBe("exit");
  });

  it("exits an owned share when the statement itself was not read", () => {
    const result = assessFis(observation({ forecastReliable: false, forecastAbsent: true, owned: true }), 40, 30);
    expect(result.status).toBe("exit");
    expect(result.reason).toContain("صورت مالی");
  });

  it("removes a loss-making share before scoring and exits it when it is already owned", () => {
    expect(assessFis(observation({ lossMaking: true }), 40, 30).status).toBe("excluded");
    expect(assessFis(observation({ lossMaking: true, owned: true }), 40, 30).status).toBe("exit");
    expect(assessFis(observation({ lossMaking: true }), 40, 30).score).toBeNull();
  });

  it("scores a missing comparable sales period as zero", () => {
    const sales = assessFis(observation({ salesGrowthPercent: null }), 40, null).factors.find((item) => item.key === "sales_growth");
    expect(sales?.score).toBe(0);
  });

  it("keeps dividend outside the sustainable band at zero", () => {
    const dividend = assessFis(observation({ dividendRatioPercent: null }), 40, 30).factors.find((item) => item.key === "dividend");
    expect(dividend?.score).toBe(0);
    const high = assessFis(observation({ dividendRatioPercent: 90 }), 40, 30).factors.find((item) => item.key === "dividend");
    expect(high?.score).toBe(0);
  });
});

describe("statement helpers", () => {
  it("strips other operating income from FIS profit", () => {
    expect(fisProfit(100, 15)).toEqual({ profit: 85, operatingOnly: false });
    expect(fisProfit(100, null)).toEqual({ profit: 100, operatingOnly: true });
  });

  it("scales million-rial earnings into a share count", () => {
    expect(sharesFromEarnings(120, 62)).toBeCloseTo((120 * 1_000_000) / 62);
    expect(payoutPercent(240, 120, 62, 300)).toBeCloseTo((240 * ((120 * 1_000_000) / 62)) / (300 * 1_000_000) * 100);
    expect(scoreFiscalYear(9, ["09/30", "09/30"])).toBe(5);
    expect(scoreFiscalYear(6, ["09/30", "09/30"])).toBe(3);
    expect(scoreFiscalYear(9, ["09/30", "12/29"])).toBe(0);
    expect(scoreFiscalYear(9, ["09/30"])).toBeNull();
    expect(scoreFiscalYear(3, ["09/30", "09/30"])).toBe(0);
    expect(salesGrowth(110, 100)).toBe(10);
  });
});
