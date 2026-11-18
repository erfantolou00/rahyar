import { describe, expect, it } from "vitest";
import {
  buildBasket,
  buildPortfolio,
  costBasis,
  profitAndLoss,
  weightPercent,
  type BasketPosition,
} from "@/lib/finance/portfolio";
import type { Asset, Price } from "@/lib/finance/types";

function position(overrides: Partial<BasketPosition> = {}): BasketPosition {
  return {
    id: "1",
    name: "فولاد",
    type: "stock",
    quantity: 10,
    avgBuyPrice: 100,
    currentPrice: 150,
    ...overrides,
  };
}

describe("costBasis", () => {
  it("multiplies quantity by average buy price", () => {
    expect(costBasis(10, 100)).toBe(1000);
  });

  it("returns null when the buy price is missing", () => {
    expect(costBasis(10, null)).toBeNull();
  });

  it("rejects negative inputs", () => {
    expect(costBasis(-1, 100)).toBeNull();
    expect(costBasis(1, -5)).toBeNull();
  });
});

describe("profitAndLoss", () => {
  it("computes absolute and percent gain", () => {
    expect(profitAndLoss({ quantity: 10, avgBuyPrice: 100, currentPrice: 150 })).toEqual({
      cost: 1000,
      absolute: 500,
      percent: 50,
    });
  });

  it("computes a loss", () => {
    expect(profitAndLoss({ quantity: 2, avgBuyPrice: 80, currentPrice: 50 })).toEqual({
      cost: 160,
      absolute: -60,
      percent: -37.5,
    });
  });

  it("returns a zero result when value equals cost", () => {
    expect(profitAndLoss({ quantity: 4, avgBuyPrice: 25, currentPrice: 25 })).toEqual({
      cost: 100,
      absolute: 0,
      percent: 0,
    });
  });

  it("leaves percent empty when cost is zero", () => {
    expect(profitAndLoss({ quantity: 3, avgBuyPrice: 0, currentPrice: 30 })).toEqual({
      cost: 0,
      absolute: 90,
      percent: null,
    });
  });

  it("leaves profit empty when the current price has not been entered", () => {
    expect(profitAndLoss({ quantity: 3, avgBuyPrice: 10, currentPrice: null })).toEqual({
      cost: 30,
      absolute: null,
      percent: null,
    });
  });

  it("leaves profit empty when the buy price is missing", () => {
    expect(profitAndLoss({ quantity: 3, avgBuyPrice: null, currentPrice: 30 })).toEqual({
      cost: null,
      absolute: null,
      percent: null,
    });
  });
});

describe("weightPercent", () => {
  it("returns the share of the total", () => {
    expect(weightPercent(25, 100)).toBe(25);
  });

  it("returns null for an empty basket", () => {
    expect(weightPercent(0, 0)).toBeNull();
    expect(weightPercent(10, 0)).toBeNull();
  });

  it("returns null when the position has no value", () => {
    expect(weightPercent(null, 100)).toBeNull();
  });
});

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "1",
    user_id: "user",
    type: "usd",
    symbol: "پس‌انداز",
    quantity: 2,
    avg_buy_price: null,
    target_min_weight: null,
    target_max_weight: null,
    risk_level: null,
    manual_value: null,
    price_unit: "rial",
    allocation_class: "usd",
    allocation_class_source: "auto",
    created_at: "2026-09-29T00:00:00Z",
    updated_at: "2026-09-29T00:00:00Z",
    ...overrides,
  };
}

function quote(overrides: Partial<Price> = {}): Price {
  return {
    id: "p",
    user_id: "user",
    asset_type: "usd",
    symbol: "USD",
    price: 800_000,
    source: "tgju-json:price_dollar_rl",
    timestamp: "2026-09-29T00:00:00Z",
    ...overrides,
  };
}

describe("buildPortfolio", () => {
  it("values a dollar holding from the live USD quote", () => {
    const snapshot = buildPortfolio([asset()], [quote()], []);
    expect(snapshot.holdings[0]?.price).toBe(800_000);
    expect(snapshot.holdings[0]?.value).toBe(1_600_000);
  });
});

describe("buildBasket", () => {
  it("weights marked positions and skips unmarked ones", () => {
    const summary = buildBasket([
      position({ id: "a", currentPrice: 30 }),
      position({ id: "b", name: "طلا", type: "gold", quantity: 1, avgBuyPrice: 200, currentPrice: 100 }),
      position({ id: "c", name: "نقد", type: "cash", currentPrice: null }),
    ]);

    expect(summary.totalValue).toBe(400);
    expect(summary.rows.map((row) => row.weight)).toEqual([75, 25, null]);
    expect(summary.rows[2]?.absolute).toBeNull();
    expect(summary.totalCost).toBe(1200);
    expect(summary.totalAbsolute).toBe(-800);
    expect(summary.totalPercent).toBeCloseTo((-800 / 1200) * 100);
  });

  it("treats the entered quote as a unit price", () => {
    const summary = buildBasket([
      position({
        name: "شبندر",
        type: "stock",
        quantity: 17_000,
        avgBuyPrice: 7_399,
        currentPrice: 14_980,
      }),
    ]);
    const row = summary.rows[0];
    expect(row?.currentValue).toBe(17_000 * 14_980);
    expect(row?.absolute).toBe(17_000 * (14_980 - 7_399));
    expect(row?.absolute ?? 0).toBeGreaterThan(0);
  });

  it("returns an empty summary for no positions", () => {
    expect(buildBasket([])).toEqual({
      rows: [],
      totalValue: 0,
      totalCost: null,
      totalAbsolute: null,
      totalPercent: null,
    });
  });
});
