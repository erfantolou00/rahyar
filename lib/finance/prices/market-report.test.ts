import { describe, expect, it } from "vitest";
import { MarketShapeError } from "@/lib/finance/prices/listed";
import { buildMarketReport } from "@/lib/finance/prices/market-report";
import { matchRahavard, parseRahavardAsset, parseRahavardSearch } from "@/lib/finance/prices/rahavard";
import { appendLiveClose, parseTsetmcDailyCloses, returnsFromCloses, shiftMonths } from "@/lib/finance/prices/returns";

describe("price change windows", () => {
  it("shifts calendar months and measures day, month, quarter, and year", () => {
    expect(shiftMonths(20261003, 1)).toBe(20260903);
    expect(shiftMonths(20261003, 3)).toBe(20260703);
    expect(shiftMonths(20261003, 12)).toBe(20251003);
    expect(shiftMonths(20260331, 1)).toBe(20260228);

    const report = returnsFromCloses(
      [
        { day: 20251001, close: 40 },
        { day: 20260701, close: 50 },
        { day: 20260901, close: 80 },
        { day: 20261002, close: 100 },
        { day: 20261003, close: 110 },
      ],
      20261003,
    );
    expect(report).toEqual({
      lastClose: 110,
      dailyChange: 10,
      dailyPercent: 10,
      monthPercent: 37.5,
      quarterPercent: 120,
      yearPercent: 175,
    });
  });

  it("uses the last close on or before the window and ignores a missing history", () => {
    const report = returnsFromCloses(
      [
        { day: 20260930, close: 3620 },
        { day: 20261001, close: 3710 },
      ],
      20261003,
    );
    expect(report.lastClose).toBe(3710);
    expect(report.dailyPercent).toBeCloseTo(2.49, 2);
    expect(report.monthPercent).toBeNull();
    expect(returnsFromCloses([], 20261003).lastClose).toBeNull();
    const live = appendLiveClose([{ day: 20261002, close: 100 }], 20261003, 110);
    expect(returnsFromCloses(live, 20261003)).toMatchObject({ lastClose: 110, dailyChange: 10, dailyPercent: 10 });
    expect(appendLiveClose([{ day: 20261003, close: 110 }], 20261003, 120)).toEqual([{ day: 20261003, close: 110 }]);
  });

  it("reads the TSETMC daily list and rejects a changed payload", () => {
    const bars = parseTsetmcDailyCloses({
      closingPriceDaily: [{ dEven: 20261003, pClosing: 3710, pDrCotVal: 3720 }],
    });
    expect(bars).toEqual([{ day: 20261003, close: 3710 }]);
    expect(() => parseTsetmcDailyCloses({ prices: [] })).toThrow(MarketShapeError);
  });
});

describe("rahavard profile", () => {
  const asset = {
    data: {
      asset: {
        trade_symbol: "فولاد",
        category: { short_name: "تولید آهن و فولاد پایه", parent: { short_name: "فلزات اساسی" } },
        instrument_state: { description: "مجاز" },
      },
      last_trade: {
        close_price: 3710,
        close_price_change: 90,
        close_price_change_percent: 0.0249,
        volume: 1200,
        value: 4500,
      },
      returns: { return_3_m: { return: 0.4114 }, return_1_y: { return: 0.956562113082955 } },
      eps: { pure_ttm: 496.28 },
      dps: { pure_eps: 518, pure_dps: 55 },
      last_pb: { value: 2.12262803132877 },
      last_free_float: { percent: 0.36389 },
      last_value: { value: 7178850000000000 },
    },
  };

  it("matches the ticker exactly and turns fractions into percents", () => {
    const rows = parseRahavardSearch({
      data: [
        { entity_id: "453", trade_symbol: "فولاد", type: "سهام", type_id: "1" },
        { entity_id: "9", trade_symbol: "فولاد2", type: "سهام", type_id: "1" },
        { entity_id: "10", trade_symbol: "فولاد", type: "صندوق", type_id: "4" },
      ],
    });
    expect(matchRahavard(rows, "فولاد")?.id).toBe("453");
    expect(matchRahavard(rows, "مبارکه")).toBeNull();
    expect(parseRahavardAsset(asset)).toMatchObject({
      price: 3710,
      eps: 518,
      dailyChange: 90,
      dailyPercent: 2.49,
      quarterPercent: 41.14,
      yearPercent: 95.66,
      freeFloatPercent: 36.39,
      pb: 2.12,
      dps: 55,
      industry: "فلزات اساسی · تولید آهن و فولاد پایه",
      state: "مجاز",
    });
  });

  it("rejects a payload that no longer has a last trade", () => {
    expect(() => parseRahavardAsset({ data: { asset: {} } })).toThrow(MarketShapeError);
    expect(() => parseRahavardSearch({ items: [] })).toThrow(MarketShapeError);
  });
});

describe("buildMarketReport", () => {
  it("keeps calculated windows and fills the rest from Rahavard", () => {
    const report = buildMarketReport({
      capturedAt: "2026-10-03T10:00:00.000Z",
      closes: {
        lastClose: 3710,
        dailyChange: 90,
        dailyPercent: 2.49,
        monthPercent: 4.2,
        quarterPercent: 40,
        yearPercent: 90,
      },
      profile: {
        price: 3700,
        eps: 518,
        dailyChange: 80,
        dailyPercent: 2.2,
        quarterPercent: 41.14,
        yearPercent: 95.66,
        volume: 10,
        tradeValue: 20,
        marketCap: 30,
        freeFloatPercent: 36.39,
        pb: 2.12,
        dps: 55,
        industry: "فلزات اساسی",
        state: "مجاز",
      },
    });
    expect(report.lastPrice).toBe(3710);
    expect(report.monthPercent).toBe(4.2);
    expect(report.quarterPercent).toBe(40);
    expect(report.marketCap).toBe(30);
    expect(report.source).toBe("tsetmc-daily+rahavard");
  });
});
